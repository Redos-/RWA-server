# RWA-server
Small proof-of-concept application that implements remote desktop functionality.
Project consist of several parts:
- Native Host application for Chrome Extension that capture desktop screen
- Chrome Extension that connects to web site and transfer video data
- Web site, which recieves video data from extension and broadcast it to any clients 

Few steps and tips to run everything:
1. Load extension folder from git
2. Change extension name in: 
- Native Host Messaging app manifest
- Web site ui.js file
4. Create a registry key HKEY_CURRENT_USER\SOFTWARE\Google\Chrome\NativeMessagingHosts\rwa and set default value as path to application's manifest
4. Change extension manifest bindings to web site ("matches")
5. Extenstions -> Load unpacked extension
6. If you running web site on client operating system (such as Windows 7 or 8), you should use IIS Express instead of full version: http://stackoverflow.com/questions/24276762/signalr-freezing-all-subsequent-http-requests
7. Change Peer.js public API key 
