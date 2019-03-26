const valueMarkers = {
  object: '{'.charCodeAt(0),
  string: 'S'.charCodeAt(0),
  uint8: 'U'.charCodeAt(0),
  int32: 'l'.charCodeAt(0),
};

const terminationMarkers = {
  object: '}'.charCodeAt(0),
};

class UbjsonDecoder {
  buffer: Uint8Array;
  position: number;
  dataView: DataView;

  constructor(buffer: Uint8Array) {
    this.buffer = buffer;
    this.position = 0;

    this.dataView = new DataView(buffer.buffer);
  }

  readObject = () => {
    const shouldContinueRead = () => this.buffer[this.position] !== terminationMarkers.object;

    const object: {[key: string]: any} = {};
    while (shouldContinueRead()) {
      const field = this.readString();
      object[field] = this.readValueAtPosition();
    }

    // Increment past the termination marker
    this.position += 1;

    return object;
  }

  readString = () => {
    // First we need to read the string length
    const length: number = this.readValueAtPosition() as number;
    if (!Number.isInteger(length)) {
      throw new Error('UBJSON decoder - failed to read string length');
    }

    // Grab current position and update
    const pos = this.position;
    this.position += length;

    // Read string
    const stringBuffer = this.buffer.slice(pos, pos + length);
    return String.fromCharCode.apply(null, stringBuffer as unknown as number[]);
  }

  readUint8 = () => {
    // Grab current position and update
    const pos = this.position;
    this.position += 1;

    // Read number
    return this.dataView.getUint8(pos);
  }

  readInt32 = () => {
    // Grab current position and update
    const pos = this.position;
    this.position += 4;

    // Read number
    return this.dataView.getInt32(pos);
  }

  readValueAtPosition = () => {
    const valueMarker = this.buffer[this.position];

    // Move position forward by 1
    this.position += 1;

    switch (valueMarker) {
      case valueMarkers.object:
        return this.readObject();
      case valueMarkers.string:
        return this.readString();
      case valueMarkers.uint8:
        return this.readUint8();
      case valueMarkers.int32:
        return this.readInt32();
      default:
        throw new Error(
          `UBJSON decoder - value type with marker ${valueMarker} is not supported yet. ` +
            `Position: ${this.position - 1}.`,
        );
    }
  }

  decode = () => this.readValueAtPosition();
}

export function decode(buffer: Uint8Array) {
  const decoder = new UbjsonDecoder(buffer);
  return decoder.decode();
}
