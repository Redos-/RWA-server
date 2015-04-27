(function ($, global) {
    /* Knockout viewmodel */
    var consoleModel = function (options) {
        var self = this;

        self.consoleData = ko.observable("");
        self.sendMessageText = ko.observable();
        self.connected = ko.observable(false);
        self.computerName = ko.observable("");
        self.selectedComputer = ko.observable();

        self.availableComputers = ko.observableArray();

        self.selectComputer = function () {
            self.selectedComputer(this);
        };

        self.connect = function () {
            dispatchEvent('ConnectToExtension');
        };

        self.disconnect = function () {
            dispatchEvent('DisconnectFromExtension');
        };

        self.sendMessageToComputer = function () {
            self.addDataToConsole('>' + self.sendMessageText());
            $.RWA.cmdHub.server.sendMessageToClient(self.selectedComputer().id, { text: self.sendMessageText() }, true);
            self.sendMessageText("");
        };

        self.recieveMessageFromComputer = function (callerId, msg, toExtesion) {
            //self.sendMessageToExtension(msg);
            if (toExtesion) {
                dispatchEvent('SendMessageToExtension', callerId, msg);
            } else {
                if (!!msg.result)
                    self.addDataToConsole(msg.result.replace(/(?:[<>])+/g, ""));
                if (!!msg.text) {
                    switch (msg.text) {
                        case "$NATIVE_APP_DISCONNECTED": {
                            self.connected(false);
                            self.addServiceMessageToConsole("Native app disconnected", "error");
                        } break;
                        default: self.addServiceMessageToConsole(msg.text); break;
                    }
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

        //self.sendMessageToExtension = function (msg) {
        //    dispatchEvent('SendMessageToExtension', msg);
        //};

        self.recieveMessageFromExtension = function (msg) {
            if (!!msg.callerId)
                $.RWA.cmdHub.server.sendMessageToClient(msg.callerId, msg, false);
            else 
            {
                self.addServiceMessageToConsole(msg.text);
                if (msg.command === "connect") {
                    app.consoleModel.connected(true);
                    app.consoleModel.computerName(msg.result);
                    app.cmdHub.server.connect(msg.result);
                }
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
            var modelContainer = document.getElementById(options.ids.modelContainer);
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
            cmd.client.receiveMessage = app.consoleModel.recieveMessageFromComputer;

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
                    port.onMessage.addListener(app.consoleModel.recieveMessageFromExtension);
                    //port.onDisconnect.addListener(function () {
                    //    app.consoleModel.connected(false);
                    //});
                    app.extensionPort = port;
                    app.extensionPort.postMessage({ command: "connect" })
                }
            });
            document.addEventListener("SendMessageToExtension", function (event) {
                if (!!event.data) {
                    app.extensionPort.postMessage({ command: "console-message", text: event.data.text, callerId: event.callerId })
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