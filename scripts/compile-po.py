import sys
import struct

def compile_po(po_path, mo_path):
    with open(po_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    entries = []
    current_id = []
    current_str = []
    state = None

    for line in lines:
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        if line.startswith('msgid '):
            if state == 'str':
                entries.append((''.join(current_id), ''.join(current_str)))
                current_id = []
                current_str = []
            state = 'id'
            current_id.append(line[6:].strip('"').encode().decode('unicode_escape'))
        elif line.startswith('msgstr '):
            state = 'str'
            current_str.append(line[7:].strip('"').encode().decode('unicode_escape'))
        elif line.startswith('"') and line.endswith('"'):
            val = line[1:-1].encode().decode('unicode_escape')
            if state == 'id':
                current_id.append(val)
            elif state == 'str':
                current_str.append(val)

    if state == 'str':
        entries.append((''.join(current_id), ''.join(current_str)))

    # Sort entries by msgid
    entries.sort(key=lambda x: x[0].encode('utf-8'))

    # Generate GNU MO file
    # MO Header format:
    # magic: 0x950412de (little-endian)
    # version: 0
    # num_strings
    # orig_table_offset
    # trans_table_offset
    # hash_table_size: 0
    # hash_table_offset: 0
    orig_bytes = [e[0].encode('utf-8') for e in entries]
    trans_bytes = [e[1].encode('utf-8') for e in entries]

    n = len(entries)
    header_size = 7 * 4
    orig_table_offset = header_size
    trans_table_offset = orig_table_offset + n * 8
    strings_offset = trans_table_offset + n * 8

    orig_table = []
    trans_table = []
    string_data = bytearray()

    for ob in orig_bytes:
        pos = strings_offset + len(string_data)
        orig_table.append((len(ob), pos))
        string_data.extend(ob + b'\x00')

    for tb in trans_bytes:
        pos = strings_offset + len(string_data)
        trans_table.append((len(tb), pos))
        string_data.extend(tb + b'\x00')

    with open(mo_path, 'wb') as f:
        f.write(struct.pack('<7I', 0x950412de, 0, n, orig_table_offset, trans_table_offset, 0, 0))
        for length, offset in orig_table:
            f.write(struct.pack('<2I', length, offset))
        for length, offset in trans_table:
            f.write(struct.pack('<2I', length, offset))
        f.write(string_data)

    print(f"Successfully compiled {po_path} -> {mo_path} with {n} messages.")

if __name__ == '__main__':
    compile_po('po/ru/runet-fix.po', 'po/ru/runet-fix.mo')
