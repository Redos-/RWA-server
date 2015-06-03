(function ($, global) {
    /* Knockout viewmodel */
    var viewModel = function (options) {
        var self = this;

        // General
        self.connected = ko.observable(false);
        self.computerName = ko.observable("");
        self.selectedComputer = ko.observable();
        self.prevElement = ko.observable();
        self.availableComputers = ko.observableArray();
        // Console
        self.consoleData = ko.observable("");
        self.sendMessageText = ko.observable();
        // Desktop View
        self.desktopViewEnabled = ko.observable(false);
        self.desktopImage = ko.observable(new Image());
        self.quality = ko.observable(50);
        self.FPS = ko.observable(5);
        self.desktopWidth = ko.observable(1280);
        self.desktopHeight = ko.observable(800);
        // Peer.js
        self.peer = ko.observable();
        self.peerId = ko.observable();
        self.hostConn = ko.observable();
        self.peerConn = ko.observable();
        self.streamingDesktop = ko.observable(false);


        self.startDesktopView = function () {
            self.desktopViewEnabled(true);
            self.requestDesktopView();
        };

        self.b64toByteArray = function (b64Data, sliceSize) {
            sliceSize = sliceSize || 512;

            var byteCharacters = atob(b64Data);
            var byteArrays = [];

            for (var offset = 0; offset < byteCharacters.length; offset += sliceSize) {
                var slice = byteCharacters.slice(offset, offset + sliceSize);

                var byteNumbers = new Array(slice.length);
                for (var i = 0; i < slice.length; i++) {
                    byteNumbers[i] = slice.charCodeAt(i);
                }

                var byteArray = new Uint8Array(byteNumbers);

                byteArrays.push(byteArray);
            }
            return byteArrays;
        };

        self.requestDesktopView = function() {
            var conn = self.peer().connect(self.selectedComputer().peerId);
            conn.on('open', function () {
                // Receive messages
                conn.on('data', function (data) {
                    var imageData = data.result;
                    var canvas = document.getElementById(options.ids.desktopViewCanvasId),
                    ctx = canvas.getContext('2d');
                    // Working simple way
                    //ctx.clearRect(0, 0, canvas.width, canvas.height);
                    //self.desktopImage().src = 'data:image/jpeg;base64,' + imageData;
                    //ctx.drawImage(self.desktopImage(), 0, 0, 1366, 768);
                    // Working blob, excludes memory leak from canvas images
                    self.desktopImage().onload = (function (image) {
                        return function (e) {
                            ctx.drawImage(image, 0, 0, 1366, 768);
                            URL.revokeObjectURL(this.src);
                        }
                    })(self.desktopImage())
                    var blob = new Blob(self.b64toByteArray(imageData, 512), { type: "image/jpeg" });
                    self.desktopImage().src = URL.createObjectURL(blob);

                    data.result = null;
                    data = null;
                    imageData = null;
                    blob = null;
                    // Fix for memory leak in peer.js
                    Object.keys(conn._chunkedData).forEach(function (item, i, arr) {
                        delete conn._chunkedData[item];
                    });
                });
                conn.send({ command: "get-screen", args: { quality: self.quality(), FPS: self.FPS(), width: self.desktopWidth(), height: self.desktopHeight() } });
            });
            self.hostConn(conn);
        };

        self.selectComputer = function (data, event) {
            self.selectedComputer(this);
            // Decorations
            var element = event.delegateTarget;
            $(element).addClass('selectedRow');
            if (!!self.prevElement()){
                $(self.prevElement()).removeClass('selectedRow'); 
            }
            self.prevElement(element);
        };

        self.connect = function () {
            self.dispatchEvent('ConnectToExtension');
        };

        self.disconnect = function () {
            self.dispatchEvent('DisconnectFromExtension');
        };

        self.sendMessageToComputer = function (message) {
            if (!!message) {
                $.RWA.cmdHub.server.sendMessageToClient(self.selectedComputer().id, { command: message.command, text: message.text }, true);
            }
            else {
                // If not defined - take message from field on page
                self.addDataToConsole('>' + self.sendMessageText());
                $.RWA.cmdHub.server.sendMessageToClient(self.selectedComputer().id, { command: "console-message", text: self.sendMessageText() }, true);
                self.sendMessageText("");
            }
        };

        self.receiveMessageFromComputer = function (callerId, msg, toExtesion) {
            // If toExtension equals true - it means that local computer should serve command.
            // Otherwise we are processing results of operation.
            if (toExtesion) {
                self.dispatchEvent('SendMessageToExtension', callerId, msg);
            } else {
                if (!!msg.text) {
                    switch (msg.text) {
                        case "console-message-completed": {
                            if (!!msg.result)
                                self.addDataToConsole(msg.result.replace(/(?:[<>])+/g, ""));
                        } break;
                        default: self.addServiceMessageToConsole(msg.text); break;
                    }
                }
            }
        };

        self.receiveMessageFromExtension = function (msg) {
            // If callerId is specified - then direct message to hub
            // Otherwise message is addressed to local computer - show in console.
            if (!!msg.callerId) {
                $.RWA.cmdHub.server.sendMessageToClient(msg.callerId, msg, false);
            }
            else {
                switch (msg.text) {
                    case "$NATIVE_APP_DISCONNECTED": {
                        self.connected(false);
                        self.addServiceMessageToConsole("Native app disconnected", "error");
                    } break;
                    case "get-screen-completed": {
                        self.peerConn().send(msg);
                    } break;
                    case "close-screen-completed": {
                        self.peerConn().close();
                    } break;
                    default: {
                        self.addServiceMessageToConsole(msg.text);
                    };
                }
                if (msg.command === "connect") {
                    app.viewModel.connected(true);
                    app.viewModel.computerName(msg.result);
                    app.cmdHub.server.connect(msg.result, self.peerId());
                }
            }
        };

        self.updateConnectedComputers = function (data) {
            if (!!data) {
                var array = [];
                for (var key in data) {
                    if (data.hasOwnProperty(key)) {
                        array.push({
                            name: data[key].Name === self.computerName() ? data[key].Name + "(This computer)" : data[key].Name,
                            id: key,
                            peerId: data[key].PeerId
                        });
                    }
                }
                self.availableComputers(array);
            }
        };

        self.addServiceMessageToConsole = function (msg, type) {
            switch (type) {
                case "error": { self.addDataToConsole("<font color=#FF0000>" + msg + "</font>") } break;
                default: { self.addDataToConsole("<font color=#00FF33>" + msg + "</font>") } break;
            }
        }

        self.addDataToConsole = function (data) {
            if (!!data) {
                var currentData = self.consoleData();
                if (currentData.length < 60000)
                    self.consoleData(currentData + "\n" + data);
                else {
                    var newData = currentData.substring(data.length + 1, currentData.length);
                    self.consoleData(newData + "\n" + data);
                }
              
            }
        };

        self.dispatchEvent = function (eventName, callerId, data) {
            var event = document.createEvent('Event');
            event.initEvent(eventName);
            if (!!data) {
                event.data = data;
            }
            if (!!callerId) {
                event.callerId = callerId;
            }
            document.dispatchEvent(event);
        };
    };
    /* Apply bindings and save stuff */
    var app = {
        register: function (options) {
            app.options = options;
            
            var modelContainer = document.getElementById('#' + options.ids.modelContainer);
            app.viewModel = new viewModel(options);
            /*Send message when enter key is pressed*/
            ko.bindingHandlers.enterkey = {
                init: function (element, valueAccessor, allBindingsAccessor, viewModel) {
                    var allBindings = allBindingsAccessor();
                    $(element).keypress(function (event) {
                        var keyCode = (event.which ? event.which : event.keyCode);
                        if (keyCode === 13) {
                            allBindings.enterkey.call(viewModel);
                            return false;
                        }
                        return true;
                    });
                }
            };
            ko.bindingHandlers.scrollDown = {
                update: function (elem, valueAccessor) {
                    $(elem).scrollTop($(elem).prop("scrollHeight"));
                }
            };
            ko.applyBindings(app.viewModel, modelContainer);
            
            /* Modal */
            $('#' + options.ids.desktopViewModalId).on('hidden.bs.modal', function () {
                app.viewModel.desktopViewEnabled(false);
                app.viewModel.sendMessageToComputer({ command: "close-screen", text: "" });
            })
            $('.btn-update-settings').on('click', function () {
                app.viewModel.quality(document.getElementById('miQuality').value);
                app.viewModel.FPS(document.getElementById('miFPS').value);
                app.viewModel.desktopWidth(document.getElementById('miWidth').value);
                app.viewModel.desktopHeight(document.getElementById('miHeight').value);
                app.viewModel.hostConn().send({
                    command: "get-screen",
                    args: { quality: app.viewModel.quality(), FPS: app.viewModel.FPS(), width: app.viewModel.desktopWidth(), height: app.viewModel.desktopHeight() }
                });
            })
            document.getElementById('miQuality').value = app.viewModel.quality();
            document.getElementById('miFPS').value = app.viewModel.FPS();
            document.getElementById('miWidth').value = app.viewModel.desktopWidth();
            document.getElementById('miHeight').value = app.viewModel.desktopHeight();
            $('.input-integer').on('keydown', function (e) {
                // Allow: backspace, delete, tab, escape, enter and .
                if ($.inArray(e.keyCode, [46, 8, 9, 27, 13, 110, 190]) !== -1 ||
                    // Allow: Ctrl+A
                    (e.keyCode == 65 && e.ctrlKey === true) ||
                    // Allow: Ctrl+C
                    (e.keyCode == 67 && e.ctrlKey === true) ||
                    // Allow: Ctrl+X
                    (e.keyCode == 88 && e.ctrlKey === true) ||
                    // Allow: home, end, left, right
                    (e.keyCode >= 35 && e.keyCode <= 39)) {
                    // let it happen, don't do anything
                    return;
                }
                // Ensure that it is a number and stop the keypress
                if ((e.shiftKey || (e.keyCode < 48 || e.keyCode > 57)) && (e.keyCode < 96 || e.keyCode > 105)) {
                    e.preventDefault();
                }
            });

            /* SignalR */
            // Declare a proxy to reference the hub. 
            var cmd = $.connection.cmdHub;
            cmd.client.updateConnectedComputers = app.viewModel.updateConnectedComputers;
            cmd.client.receiveMessage = app.viewModel.receiveMessageFromComputer;
            // Start the connection.
            $.connection.hub.start().done(function () {
            });
            app.cmdHub = cmd;

            /* Register extension port */
            /* This will allow web page to communicate with extension */
            document.addEventListener("ConnectToExtension", function () {
                var port = chrome.runtime.connect("fagmagkhnbjillhgognkkhpeehnamiom", { name: "web-site" });
                if (!!port) {
                    port.onMessage.addListener(app.viewModel.receiveMessageFromExtension);
                    port.onDisconnect.addListener(function () {
                        app.viewModel.connected(false);
                    });
                    app.extensionPort = port;
                    app.extensionPort.postMessage({ command: "connect" })
                }
            });
            document.addEventListener("SendMessageToExtension", function (event) {
                if (!!event.data) {
                    app.extensionPort.postMessage({ command: event.data.command, text: event.data.text, args: event.data.args, callerId: event.callerId })
                }
            });
            document.addEventListener("DisconnectFromExtension", function () {
                app.extensionPort.postMessage({ command: "disconnect" })
                cmd.server.disconnect();
            });

            /* Peer.js */
            var peer = new Peer({ key: '' });
            peer.on('open', function (id) {
                app.viewModel.peerId(id);
            });
            peer.on('connection', function (conn) {
                // Receive messages
                conn.on('data', function (msg) {
                    if (!!msg) {
                        if (msg.command === "get-screen") {
                            app.viewModel.streamingDesktop(true);
                            app.viewModel.dispatchEvent('SendMessageToExtension', "", msg);
                        }
                        if (msg.command === "close-screen") {
                            app.viewModel.streamingDesktop(false);
                            app.viewModel.dispatchEvent('SendMessageToExtension', "", msg);
                        }
                    }
                });
                app.viewModel.peerConn(conn);
            });
            app.viewModel.peer(peer);
        }
    };

    $.RWA = app;
})(jQuery, window);