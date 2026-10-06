// Verschlüsselt die PROVISIONING_SECRET-Werte der Instanzen, bevor sie in
// die Datenbank geschrieben werden (Spezifikation: "Geheimnis verschlüsselt
// speichern, nie protokollieren"). AES-256-GCM, Schlüssel kommt aus der
// Umgebungsvariable SECRET_ENCRYPTION_KEY (32 Byte, als Hex, z. B. erzeugt
// mit `openssl rand -hex 32`).
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function getKey(): Buffer {
  const hex = process.env.SECRET_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      "SECRET_ENCRYPTION_KEY ist nicht gesetzt. Erzeugen mit: openssl rand -hex 32",
    );
  }
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error("SECRET_ENCRYPTION_KEY muss 32 Byte (64 Hex-Zeichen) lang sein");
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    Buffer.concat([ciphertext, authTag]).toString("base64"),
  ].join(".");
}

export function decryptSecret(stored: string): string {
  const key = getKey();
  const [ivB64, payloadB64] = stored.split(".");
  if (!ivB64 || !payloadB64) {
    throw new Error("Ungültiges Format für verschlüsseltes Secret");
  }
  const iv = Buffer.from(ivB64, "base64");
  const payload = Buffer.from(payloadB64, "base64");
  const authTag = payload.subarray(payload.length - 16);
  const ciphertext = payload.subarray(0, payload.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
