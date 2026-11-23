# pt_tag.py <script in> <script out> <old tag> <new tag>
# The build tag written into PT's published script, for a build that changes data alone (b1105jz to b1105kl, 2026-11-22: Dust's and
# Neon's map files). The old tag must stand in the script exactly once and the new one not at all; nothing is written otherwise.
# Tags of one length (`b1105ju 11-19`, `b1105kl 11-22`) leave the script's size as it was.
import sys
src, out, old, new = sys.argv[1:5]
b = open(src, 'rb').read(); o, n = old.encode(), new.encode()
assert b.count(o) == 1, 'the old tag stands %d times in the script' % b.count(o)
assert b.count(n) == 0, 'the new tag is in the script already'
open(out, 'wb').write(b.replace(o, n)); print('tag %s -> %s, %d bytes' % (old, new, len(b) - len(o) + len(n)))
