var nativeAppPort;
var webPagePort;
chrome.extension.nativeHostConnected = false;
chrome.extension.webPageConnected = false;

chrome.extension.onRequest.addListener(function(data, sender) {
    if (data && data.command && data.command.length > 0) {
		switch (data.command) {
			case "CONNECT": {
				connectToNativeApp(data.appName);
			} break;
			case "SEND_MESSAGE_NATIVE": {
				console.log("sending message");
				nativeAppPort.postMessage(data.value);
			} break;
			case "SEND_MESSAGE_WEB": {
				webPagePort.postMessage(data.value);
			} break;
			case "INIT_PAGE_CONNECT_LISTENER": {
				initPageConnectListener();
			} break;
			default: {}
		}
    }
});

chrome.runtime.onMessageExternal.addListener(function(message, sender, sendResponse) {
	console.log("External message: " + message.text);
});

function connectToNativeApp(appName) {
	if (!!!nativeAppPort){
		nativeAppPort = chrome.extension.connectNative(appName);
		nativeAppPort.onMessage.addListener(function(msg) {
			console.log("App sends: " + msg.text);
			if (!!msg.result)
				webPagePort.postMessage(msg);
		});
		nativeAppPort.onDisconnect.addListener(function() {
			console.log("Disconnected from native app");
			chrome.extension.nativeHostConnected = false;
			if (!!webPagePort && chrome.extension.webPageConnected){
				webPagePort.postMessage({text: "$NATIVE_APP_DISCONNECTED"});
			}
			nativeAppPort = null;
		});
		chrome.extension.nativeHostConnected = true;
	}
	console.log("Connected to native app");
	webPagePort.postMessage({text: "Native app connected"});
}

function initPageConnectListener() {
	if (!!!chrome.extension.listenerExist) {
		chrome.runtime.onConnectExternal.addListener(function(port){
			webPagePort = port;
			webPagePort.postMessage({text: "Extension connected"});
			webPagePort.onMessage.addListener(function(msg) {
				console.log("Command from web page: " + msg.command);
				if (!!msg.command && chrome.extension.nativeHostConnected) {
					nativeAppPort.postMessage({command: msg.command, text: msg.text, args: msg.args, callerId: msg.callerId});
				}
			});
			webPagePort.onDisconnect.addListener(function(){
				console.log("Disconnected from web page");
				chrome.extension.webPageConnected = false;
			});
			chrome.extension.webPageConnected = true;
			connectToNativeApp("rwa");
		});
		chrome.extension.listenerExist = true;
	}
}
