import struct
import sys

def parse_btsnoop(filename):
    with open(filename, 'rb') as f:
        # Read header
        header = f.read(16)
        if len(header) < 16:
            print("File too short")
            return

        magic = header[:8]
        if magic != b'btsnoop\0':
            print(f"Invalid magic: {magic}")
            return

        print("Parsing btsnoop file...")
        
        packet_num = 0
        while True:
            # Record header:
            # Original Length (4 bytes)
            # Included Length (4 bytes)
            # Packet Flags (4 bytes)
            # Cumulative Drops (4 bytes)
            # Timestamp (8 bytes)
            rec_header = f.read(24)
            if len(rec_header) < 24:
                break
            
            orig_len, inc_len, flags, drops, ts = struct.unpack('>IIIII', rec_header[:20])
            # timestamp is 8 bytes, but struct.unpack checks for size. 
            # actually timestamp is 8 bytes.
            # let's redo unpack
            orig_len, inc_len, flags, drops = struct.unpack('>IIII', rec_header[:16])
            
            # Timestamp is microseconds since 0 AD.
            
            packet_data = f.read(inc_len)
            if len(packet_data) < inc_len:
                break
                
            packet_num += 1
            
            # Simple HCI parsing
            # HCI Packet Types: 
            # 0x01: Command
            # 0x02: ACL Data
            # 0x03: SCO Data
            # 0x04: Event
            
            # We are interested in ACL Data (0x02) -> L2CAP -> ATT -> Write Request/Command
            
            pkt_type = packet_data[0]
            
            if pkt_type == 0x02: # ACL Data
                # ACL Header: Handle & Flags (2 bytes), Data Len (2 bytes)
                if len(packet_data) < 5: continue
                
                handle_flags, data_len = struct.unpack('<HH', packet_data[1:5])
                handle = handle_flags & 0x0FFF
                pb_flag = (handle_flags >> 12) & 0x3
                bc_flag = (handle_flags >> 14) & 0x3
                
                # Payload starts at 5
                payload = packet_data[5:]
                
                # L2CAP Header: Length (2 bytes), Channel ID (2 bytes)
                if len(payload) < 4: continue
                l2cap_len, l2cap_cid = struct.unpack('<HH', payload[:4])
                
                l2cap_payload = payload[4:]
                
                if l2cap_cid == 0x0004: # Attribute Protocol (ATT)
                    opcode = l2cap_payload[0]
                    
                    # 0x12: Write Request
                    # 0x52: Write Command
                    # 0x1B: Notification
                    if opcode in [0x12, 0x52, 0x1B]:
                        # Opcode (1) + Handle (2) + Value (N)
                        if len(l2cap_payload) < 3: continue
                        att_handle = struct.unpack('<H', l2cap_payload[1:3])[0]
                        value = l2cap_payload[3:]
                        
                        hex_val = value.hex()
                        print(f"#{packet_num} Op: {hex(opcode)} Handle: {hex(att_handle)} Len: {len(value)} Data: {hex_val}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python parse_log.py <logfile>")
    else:
        parse_btsnoop(sys.argv[1])
