using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.IO;
using System.Web.Helpers;
using System.Diagnostics;
using System.Drawing;
using System.Threading;
using System.Windows.Forms;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Threading.Tasks;

namespace rwa
{
    class Program
    {
        #region Static Variables
        // Streams
        static Stream stdin = Console.OpenStandardInput();
        static Stream stdout = Console.OpenStandardOutput();
        static Stream stderr = Console.OpenStandardError();

        // JPEG
        static ImageCodecInfo jpegCodecInfo;
        static EncoderParameters jpegCodecParams;

        // Screen capture
        static bool CaptureStarted = false;
        static int FPS = 30;
        static Size DestinationSize = new Size(1366, 768);
        #endregion

        #region Extension Messaging

        static byte[] GetBytes(string str)
        {
            byte[] bytes = new byte[str.Length * sizeof(char)];
            System.Buffer.BlockCopy(str.ToCharArray(), 0, bytes, 0, bytes.Length);
            return bytes;
        }

        static string GetString(byte[] bytes)
        {
            char[] chars = new char[bytes.Length / sizeof(char)];
            System.Buffer.BlockCopy(bytes, 0, chars, 0, bytes.Length);
            return new string(chars);
        }

        private static string ReceiveMessage()
        {
            //// We need to read first 4 bytes for length information
            int length = 0;
            byte[] bytes = new byte[4];
            stdin.Read(bytes, 0, 4);
            length = System.BitConverter.ToInt32(bytes, 0);

            string input = "";
            for (int i = 0; i < length; i++)
            {
                input += (char)stdin.ReadByte();
            }

            return input;
        }

        private static void SendMessage(string stringData)
        {
            var bytes = System.Text.Encoding.UTF8.GetBytes(stringData);
            int DataLength = bytes.Length;
            //// We need to send the 4 btyes of length information
            stdout.WriteByte((byte)((DataLength >> 0) & 0xFF));
            stdout.WriteByte((byte)((DataLength >> 8) & 0xFF));
            stdout.WriteByte((byte)((DataLength >> 16) & 0xFF));
            stdout.WriteByte((byte)((DataLength >> 24) & 0xFF));
            //Available total length : 4,294,967,295 ( FF FF FF FF )
            stdout.Write(bytes, 0, bytes.Length);
        }

        #endregion

        #region Screen Capture
        static Bitmap CaptureRegion(int x, int y, int width, int height)
        {
            IntPtr desktopWnd = Win32Stuff.GetDesktopWindow();
            IntPtr sourceDC = IntPtr.Zero;
            IntPtr targetDC = IntPtr.Zero;
            IntPtr compatibleBitmapHandle = IntPtr.Zero;
            Bitmap bitmap = null;
            try
            {
                // Device context for desktop
                sourceDC = Win32Stuff.GetDC(desktopWnd);
                // Target DC and BMP will be used for copy
                targetDC = Win32Stuff.CreateCompatibleDC(sourceDC);
                compatibleBitmapHandle = Win32Stuff.CreateCompatibleBitmap(sourceDC, width, height);
                // Select target and copy
                Win32Stuff.SelectObject(targetDC, compatibleBitmapHandle);
                Win32Stuff.BitBlt(targetDC, 0, 0, width, height, sourceDC, x, y, Win32Stuff.TernaryRasterOperations.SRCCOPY);
                bitmap = Image.FromHbitmap(compatibleBitmapHandle);
            }
            catch (Exception ex)
            {
                // TODO: Add logging
            }
            finally
            {
                Win32Stuff.ReleaseDC(desktopWnd, sourceDC);
                Win32Stuff.DeleteDC(targetDC);
                Win32Stuff.DeleteObject(compatibleBitmapHandle);
                Win32Stuff.DeleteDC(compatibleBitmapHandle);
            }

            return bitmap;
        }

        static Bitmap ResizeImage(Bitmap bmp, Size size)
        {
            int sourceWidth = bmp.Width;
            int sourceHeight = bmp.Height;

            float nPercent = 0;
            float nPercentW = 0;
            float nPercentH = 0;

            nPercentW = ((float)size.Width / (float)sourceWidth);
            nPercentH = ((float)size.Height / (float)sourceHeight);

            if (nPercentH < nPercentW)
                nPercent = nPercentH;
            else
                nPercent = nPercentW;

            int destWidth = (int)(sourceWidth * nPercent);
            int destHeight = (int)(sourceHeight * nPercent);

            Bitmap b = new Bitmap(destWidth, destHeight);
            Graphics g = Graphics.FromImage(b);
            g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.Low;

            g.DrawImage(bmp, 0, 0, destWidth, destHeight);
            g.Dispose();

            return b;
        }

        static Bitmap CaptureCursor(ref int x, ref int y)
        {
            Bitmap bmp = null;
            IntPtr hicon = IntPtr.Zero;
            Win32Stuff.CURSORINFO ci = new Win32Stuff.CURSORINFO();
            Win32Stuff.ICONINFO icInfo = new Win32Stuff.ICONINFO();
            ci.cbSize = Marshal.SizeOf(ci);
            if (Win32Stuff.GetCursorInfo(out ci))
            {
                if (ci.flags == Win32Stuff.CURSOR_SHOWING)
                {
                    hicon = Win32Stuff.CopyIcon(ci.hCursor);
                    if (Win32Stuff.GetIconInfo(hicon, out icInfo))
                    {
                        x = ci.ptScreenPos.x - ((int)icInfo.xHotspot);
                        y = ci.ptScreenPos.y - ((int)icInfo.yHotspot);
                        Icon ic = Icon.FromHandle(hicon);
                        bmp = ic.ToBitmap();
                        ic.Dispose();
                    }

                }
            }
            Win32Stuff.DestroyIcon(hicon);
            Win32Stuff.DeleteObject(icInfo.hbmMask);
            Win32Stuff.DeleteObject(icInfo.hbmColor);
            Win32Stuff.DeleteObject(ci.hCursor);
            Win32Stuff.DeleteDC(icInfo.hbmMask);
            Win32Stuff.DeleteDC(icInfo.hbmColor);
            Win32Stuff.DeleteDC(ci.hCursor);
            return bmp;
        }

        static CancellationTokenSource CaptureScreenCT;
        static void StartCapture()
        {
            CaptureScreenCT = new CancellationTokenSource();
            var task = Task.Run(() => GetScreen(CaptureScreenCT.Token), CaptureScreenCT.Token);
        }

        static void GetScreen(CancellationToken cToken)
        {
            Stopwatch stopWatch = new Stopwatch();
            stopWatch.Start();
            while (true)
            {
                if (cToken.IsCancellationRequested)
                {
                    stopWatch.Stop();
                    cToken.ThrowIfCancellationRequested();
                }
                if (stopWatch.ElapsedMilliseconds > (1000/FPS))
                {
                    var bmp = CaptureRegion(0, 0, 
                        Screen.PrimaryScreen.WorkingArea.Width,
                        Screen.PrimaryScreen.WorkingArea.Height);
                    // Memory stream should be disposed only after work with bitmap is over
                    var ms = new MemoryStream();
                    var base64 = "";
                    if (bmp != null)
                    {
                        using (var gr = Graphics.FromImage(bmp))
                        {
                            var cursorX = 0;
                            var cursorY = 0;
                            try
                            {
                                var cursorBMP = CaptureCursor(ref cursorX, ref cursorY);
                                if (cursorBMP != null)
                                {
                                    Rectangle r = new Rectangle(cursorX, cursorY,
                                        cursorBMP.Width, cursorBMP.Height);
                                    gr.DrawImage(cursorBMP, r);
                                    gr.Flush();
                                    cursorBMP.Dispose();
                                }
                            }
                            catch (Exception e)
                            {
                                // TODO: Add logging about cursor
                            }
                            bmp = ResizeImage(bmp, DestinationSize);
                            bmp.Save(ms, jpegCodecInfo, jpegCodecParams);
                            base64 = Convert.ToBase64String(ms.ToArray());
                        }
                        Message outmsg = new Message() { text = "get-screen-completed", result = base64 };
                        SendMessage(Json.Encode(outmsg));
                        bmp.Dispose();
                        ms.Dispose();
                    }
                    stopWatch.Reset();
                    stopWatch.Start();
                }
            }
        }

        static void EndCapture()
        {
            if (CaptureScreenCT != null)
                CaptureScreenCT.Cancel();
        }

        #endregion

        public static void Main(string[] args)
        {
            bool quit = false;

            // JPEG codec init
            jpegCodecInfo = ImageCodecInfo.GetImageEncoders().Where(c => c.MimeType.Equals("image/jpeg")).First();
            var qualityEncoder = Encoder.Quality;
            var ratio = new EncoderParameter(qualityEncoder, (long)60);
            jpegCodecParams = new EncoderParameters(1);
            jpegCodecParams.Param[0] = ratio;
            
            while (!quit) {
                Thread.Sleep(1000);
                var unDecodedMsg = ReceiveMessage();
                Message msg = Json.Decode<Message>(unDecodedMsg);
                if (msg != null)
                {
                    switch (msg.command)
                    {
                        case "disconnect": quit = true; break;
                        case "connect":
                            {
                                Message outmsg = new Message() { text = "Connected to Native Host", command = msg.command, result = System.Environment.MachineName };
                                SendMessage(Json.Encode(outmsg));
                            } break;
                        case "console-message":
                            {
                                // Start the child process.
                                Process p = new Process();//Process.Start("cmd", @"/c" + msg.command.Replace("/", "\\"));
                                p.StartInfo.FileName = "cmd";
                                p.StartInfo.Arguments = @"/c" + msg.text.Replace("/", "\\");
                                p.StartInfo.UseShellExecute = false;
                                p.StartInfo.RedirectStandardOutput = true;
                                p.StartInfo.RedirectStandardError = true;
                                p.StartInfo.CreateNoWindow = true;
                                p.Start();
                                string output = p.StandardOutput.ReadToEnd();
                                string error = p.StandardError.ReadToEnd();
                                p.WaitForExit();
                                var result = "";
                                if (String.IsNullOrWhiteSpace(output))
                                    result = error;
                                else
                                    result = output;
                                Message outmsg = new Message() { text = "console-message-completed", result = result, callerId = msg.callerId };
                                SendMessage(Json.Encode(outmsg));
                            } break;
                        case "get-screen":
                            {
                                if (msg.args != null)
                                {
                                    var msgArgs = (Dictionary<string, object>)msg.args;
                                    foreach (var kvp in msgArgs)
                                    {
                                        switch (kvp.Key)
                                        {
                                            case "quality":
                                                {
                                                    ratio = new EncoderParameter(qualityEncoder, (long)Convert.ToInt64(kvp.Value));
                                                    jpegCodecParams.Param[0] = ratio;
                                                } break;
                                            case "FPS":
                                                {
                                                    FPS = (int)Convert.ToInt32(kvp.Value);
                                                } break;
                                            case "width":
                                                {
                                                    DestinationSize = new Size((int)Convert.ToInt32(kvp.Value), DestinationSize.Height);
                                                } break;
                                            case "height":
                                                {
                                                    DestinationSize = new Size(DestinationSize.Width, (int)Convert.ToInt32(kvp.Value));
                                                } break;
                                        }
                                    }
                                }
                                if (!CaptureStarted)
                                {
                                    StartCapture();
                                    CaptureStarted = true;
                                }
                            } break;
                        case "close-screen": 
                            {
                                EndCapture();
                                CaptureStarted = false;
                                Message outmsg = new Message() { text = "close-screen-completed" };
                                SendMessage(Json.Encode(outmsg));
                            } break;

                        default:
                            {
                                
                            } break;
                    }
                }
            }
        }

    }
}
