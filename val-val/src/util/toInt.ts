export default function toInt(buffer: Buffer): number {
    const hex = buffer.toString("hex");
    if (hex.length === 0) {
        return 0
    }
    return parseInt(hex, 16);
}
