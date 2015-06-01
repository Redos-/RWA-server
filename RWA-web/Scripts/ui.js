(function ($, global) {
    /* Knockout viewmodel */
    var viewModel = function (options) {
        var self = this;

        self.consoleData = ko.observable("");
        self.sendMessageText = ko.observable();
        self.connected = ko.observable(false);
        self.computerName = ko.observable("");
        self.selectedComputer = ko.observable();
        self.prevElement = ko.observable();
        self.desktopViewEnabled = ko.observable(false);

        // peer.js
        self.peer = ko.observable();
        self.peerId = ko.observable();
        self.hostConn = ko.observable();
        self.peerConn = ko.observable();
        self.streamingDesktop = ko.observable(false);

        self.availableComputers = ko.observableArray();

        self.startDesktopView = function () {
            $('#' + options.ids.desktopViewModalId).on('hidden.bs.modal', function () {
                self.desktopViewEnabled(false);
                self.sendMessageToComputer({ command: "close-screen", text: "" });
                self.hostConn().close();
            })
            self.desktopViewEnabled(true);
            self.requestDesktopView();
        };

        self.requestDesktopView = function() {
            // Old variant with server
            //self.sendMessageToComputer({ command: "get-screen", text: "" });
            var conn = self.peer().connect(self.selectedComputer().peerId);
            conn.on('open', function () {
                // Receive messages
                conn.on('data', function (data) {
                    var imageData = data.result;
                    var canvas = document.getElementById(options.ids.desktopViewCanvasId),
                    ctx = canvas.getContext('2d'),
                    pic = new Image();
                    pic.src = 'data:image/jpeg;base64,' + imageData;
                    ctx.drawImage(pic, 0, 0, 1366, 768);
                    pic = null;
                    imageData = null;
                    data = null;
                });
                // Send messages
                conn.send({ command: "get-screen", text: "" });
            });
            self.hostConn(conn);
        };

        self.receiveDesktopView = function (data) {
            if (data.result === "success") {
                // Old variant with server
                //var imageData = "";
                //$.ajax({
                //    type: "GET",
                //    url: options.urls.getImageUrl,
                //    async: false,
                //    data: {
                //        callerId: data.callerId
                //    },
                //    success: function (data) {
                //        imageData = data;
                //    }
                //});
                //var canvas = document.getElementById(options.ids.desktopViewCanvasId),
                //ctx = canvas.getContext('2d'),
                //pic = new Image();
                //pic.src = 'data:image/jpeg;base64,' + imageData;
                //ctx.drawImage(pic, 0, 0, 1366, 768);
                //if (self.desktopViewEnabled())
                //    setTimeout(self.requestDesktopView, 1);
            }
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
                        case "$NATIVE_APP_DISCONNECTED": {
                            self.connected(false);
                            self.addServiceMessageToConsole("Native app disconnected", "error");
                        } break;
                        case "console-message-completed": {
                            if (!!msg.result)
                                self.addDataToConsole(msg.result.replace(/(?:[<>])+/g, ""));
                        } break;
                        case "get-screen-completed": {
                            if (!!msg.result)
                                self.receiveDesktopView(msg);
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
                //// Old variant
                //// If its screen data, store it on server and notify client for download
                //var uri = "";
                //$.ajax({ 
                //    type: "POST", 
                //    url: options.urls.saveImageUrl,
                //    async: false, 
                //    data: {
                //        callerId: msg.callerId,
                //        data : msg.result
                //    }
                //});
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

            /* SignalR part */
            // Declare a proxy to reference the hub. 
            var cmd = $.connection.cmdHub;
            // Create a function that the hub can call to broadcast messages.
            cmd.client.broadcastMessage = function (name, message, data) {
                // TODO: Testing stuff, remove when unnecessary
                // Html encode display name and message. 
                //var encodedName = $('<div />').text(name).html();
                //var encodedMsg = $('<div />').text(message).html();
                //// Add the message to the page. 
                //$('#discussion').append('<li><strong>' + encodedName
                //    + '</strong>:&nbsp;&nbsp;' + encodedMsg + '</li>');

            };
            cmd.client.updateConnectedComputers = app.viewModel.updateConnectedComputers;
            cmd.client.receiveMessage = app.viewModel.receiveMessageFromComputer;

            // Start the connection.
            $.connection.hub.start().done(function () {
                // TODO: Testing stuff, remove when unnecessary
                //$('#sendmessage').click(function () {
                //    // Call the Send method on the hub. 
                //    cmd.server.send($('#displayname').val(), $('#message').val());
                //    // Clear text box and reset focus for next comment. 
                //    $('#message').val('').focus();
                //});
                //cmd.server.getConnectedComputers();
                /* Disconnect client if page was refreshed */
                
            });
            app.cmdHub = cmd;

            /* Register extension port */
            /* This will allow web page to communicate with extension */
            document.addEventListener("ConnectToExtension", function () {
                // TODO: Testing stuff - remove later
                //chrome.runtime.sendMessage("idgohcnlmadelahillndfoeeblikheef", { text: "hello event" });
                var port = chrome.runtime.connect("fagmagkhnbjillhgognkkhpeehnamiom", { name: "web-site" });
                if (!!port) {
                    port.onMessage.addListener(app.viewModel.receiveMessageFromExtension);
                    //port.onDisconnect.addListener(function () {
                    //    app.viewModel.connected(false);
                    //});
                    app.extensionPort = port;
                    app.extensionPort.postMessage({ command: "connect" })
                }
            });
            document.addEventListener("SendMessageToExtension", function (event) {
                if (!!event.data) {
                    app.extensionPort.postMessage({ command: event.data.command, text: event.data.text, callerId: event.callerId })
                }
            });
            document.addEventListener("DisconnectFromExtension", function () {
                app.extensionPort.postMessage({ command: "disconnect" })
                cmd.server.disconnect(app.viewModel.computerName());
            });

            // peer.js
            var peer = new Peer({ key: 'db1nx6o56mie8kt9' });
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

            //// Video/audio
            //// Call a peer, providing our mediaStream
            //var call = peer.call('dest-peer-id',
            //  mediaStream);
            //call.on('stream', function (stream) {
            //    // `stream` is the MediaStream of the remote peer.
            //    // Here you'd add it to an HTML video/canvas element.
            //});
            //peer.on('call', function (call) {
            //    // Answer the call, providing our mediaStream
            //    call.answer(mediaStream);
            //});
        }
    };

    $.RWA = app;
})(jQuery, window);