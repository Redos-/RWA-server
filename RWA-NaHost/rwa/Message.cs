using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Runtime.Serialization;

namespace rwa
{
    [DataContract]
    public class Message
    {
        [DataMember]
        public string text { get; set; }

        [DataMember]
        public object args { get; set; }

        [DataMember]
        public string command { get; set; }

        [DataMember]
        public string callerId { get; set; }

        [DataMember]
        public string result { get; set; }
    }
}
