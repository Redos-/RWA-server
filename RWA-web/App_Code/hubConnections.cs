using System;
using System.Collections.Generic;
using System.Linq;
using System.Web;


public class Peer
{
    public string Name { get; set; }
    public string PeerId { get; set; }

    public Peer(string name, string peerId)
    {
        Name = name;
        PeerId = peerId;
    }
}

public static class hubConnections
{
    public static readonly Dictionary<string, Peer> ConnectedComputers = new Dictionary<string, Peer>();

}