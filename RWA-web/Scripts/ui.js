(function ($, global) {
    /* Knockout viewmodel */
    var consoleModel = function (options) {
        var self = this;

        self.consoleData = ko.observable("");
        self.sendMessageText = ko.observable();
        self.connected = ko.observable(false);
        self.computerName = ko.observable("");
        self.selectedComputer = ko.observable();
        self.prevElement = ko.observable();
        self.desktopViewEnabled = ko.observable(false);

        self.availableComputers = ko.observableArray();

        self.startDesktopView = function () {
            $('#' + options.ids.desktopViewModalId).on('hidden.bs.modal', function () {
                self.desktopViewEnabled(false);
            })
            self.desktopViewEnabled(true);
            // 30 for a start, may be adjust later
            setTimeout(self.requestDesktopView, 1);
        };

        self.requestDesktopView = function() {
            self.sendMessageToComputer({command: "get-screen", text: ""});
        };

        self.receiveDesktopView = function (data) {
            if (data.result === "success") {
                var imageData = "";
                $.ajax({
                    type: "GET",
                    url: options.urls.getImageUrl,
                    async: false,
                    data: {
                        callerId: data.callerId
                    },
                    success: function (data) {
                        imageData = data;
                    }
                });
                var canvas = document.getElementById(options.ids.desktopViewCanvasId),
                ctx = canvas.getContext('2d'),
                pic = new Image();
                pic.src = 'data:image/jpeg;base64,' + imageData;
                ctx.drawImage(pic, 0, 0, 1366, 768);
                if (self.desktopViewEnabled())
                    setTimeout(self.requestDesktopView, 1);
            }
        };

        self.selectComputer = function (data, event) {
            self.selectedComputer(this);
            var element = event.delegateTarget;
            $(element).addClass('selectedRow');
            if (!!self.prevElement()){
                $(self.prevElement()).removeClass('selectedRow'); 
            }
            self.prevElement(element);
        };

        self.connect = function () {
            dispatchEvent('ConnectToExtension');
        };

        self.disconnect = function () {
            dispatchEvent('DisconnectFromExtension');
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
                dispatchEvent('SendMessageToExtension', callerId, msg);
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
                // If its screen data, store it on server and notify client for download
                if (msg.text === "get-screen-completed") {
                    var uri = "";
                    $.ajax({ 
                        type: "POST", 
                        url: options.urls.saveImageUrl,
                        async: false, 
                        data: {
                            callerId: msg.callerId,
                            data : msg.result
                        }
                    });
                    msg.result = "success";
                }
                $.RWA.cmdHub.server.sendMessageToClient(msg.callerId, msg, false);
            }
            else {
                self.addServiceMessageToConsole(msg.text);
                if (msg.command === "connect") {
                    app.consoleModel.connected(true);
                    app.consoleModel.computerName(msg.result);
                    app.cmdHub.server.connect(msg.result);
                }
            }
        };

        self.updateConnectedComputers = function (data) {
            if (!!data) {
                var array = [];
                for (var key in data) {
                    if (data.hasOwnProperty(key)) {
                        array.push({ name: data[key] === self.computerName() ? data[key] + "(This computer)" : data[key], id: key });
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

        var dispatchEvent = function (eventName, callerId, data) {
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
            app.consoleModel = new consoleModel(options);
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
            ko.applyBindings(app.consoleModel, modelContainer);

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
            cmd.client.updateConnectedComputers = app.consoleModel.updateConnectedComputers;
            cmd.client.receiveMessage = app.consoleModel.receiveMessageFromComputer;

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
                    port.onMessage.addListener(app.consoleModel.receiveMessageFromExtension);
                    //port.onDisconnect.addListener(function () {
                    //    app.consoleModel.connected(false);
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
                cmd.server.disconnect(app.consoleModel.computerName());
            });
        }
    };

    $.RWA = app;
})(jQuery, window);