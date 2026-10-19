# Pack PNG files into one .ico (PNG-compressed entries, supported by every current browser).
import struct, sys
out, pngs = sys.argv[1], sys.argv[2:]
data = [open(p, "rb").read() for p in pngs]
head = struct.pack("<HHH", 0, 1, len(data))
offset, dirs = 6 + 16 * len(data), b""
for d in data:
    w, h = struct.unpack(">II", d[16:24])
    dirs += struct.pack("<BBBBHHII", w % 256, h % 256, 0, 0, 1, 32, len(d), offset)
    offset += len(d)
open(out, "wb").write(head + dirs + b"".join(data))
