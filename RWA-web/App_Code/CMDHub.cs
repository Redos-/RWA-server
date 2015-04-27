using System;
using System.Collections.Generic;
using System.Linq;
using System.Web;
using Microsoft.AspNet.SignalR;
using System.Threading.Tasks;

public class cmdHub : Hub
{

    /// <summary>
    /// Connect computer to receive commands
    /// </summary>
    public void Connect(string name)
    {
        hubConnections.ConnectedComputers.Add(Context.ConnectionId, name);
        Clients.All.updateConnectedComputers(hubConnections.ConnectedComputers);
    }
    public void Disconnect()
    {
        hubConnections.ConnectedComputers.Remove(Context.ConnectionId);
        Clients.All.updateConnectedComputers(hubConnections.ConnectedComputers);
    }

    /// <summary>
    /// Send message to all clients
    /// </summary>
    public void Send(string name, string message, object data)
    {
        // Call the broadcastMessage method to update clients.
        Clients.All.broadcastMessage(name, message, data);
    }

    public void SendMessageToClient(string clientId, object message, bool toExtension)
    {
        Clients.Client(clientId).receiveMessage(Context.ConnectionId, message, toExtension);
    }

    public override Task OnConnected()
    {
        Clients.Caller.updateConnectedComputers(hubConnections.ConnectedComputers);
        return base.OnConnected();
    }

    public override Task OnReconnected()
    {
        Clients.Caller.updateConnectedComputers(hubConnections.ConnectedComputers);
        return base.OnReconnected();
    }

    public override Task OnDisconnected(bool stopCalled)
    {
        hubConnections.ConnectedComputers.Remove(Context.ConnectionId);
        Clients.Others.updateConnectedComputers(hubConnections.ConnectedComputers);
        return base.OnDisconnected(stopCalled);
    }

}