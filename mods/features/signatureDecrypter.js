/**
 * Utility to decrypt YouTube signature ciphers.
 * This is based on common patterns found in YouTube's base.js.
 */

export const signatureDecrypter = {
    /**
     * Decrypts a stream object if it has a signatureCipher instead of a URL.
     * @param {Object} format The format object from YouTube's streamingData.
     * @returns {Object} The updated format object with a direct 'url' property.
     */
    decrypt(format) {
        if (format.url) return format;
        const cipher = format.signatureCipher || format.cipher;
        if (!cipher) return format;

        const params = new URLSearchParams(cipher);
        const url = params.get('url');
        const signature = params.get('s');
        const sp = params.get('sp') || 'sig';

        if (!url || !signature) {
            console.warn('[SignatureDecrypter] Invalid cipher data', { hasUrl: !!url, hasSig: !!signature });
            return format;
        }

        try {
            const decryptedSig = this.decipher(signature);
            format.url = `${url}&${sp}=${decryptedSig}`;
            return format;
        } catch (e) {
            console.error('[SignatureDecrypter] Decryption failed:', e);
            return format;
        }
    },

    /**
     * Deciphers the signature using heuristic transformations.
     * In a real environment like TizenTube, we try to match the patterns 
     * from the currently loaded player.
     */
    decipher(sig) {
        let s = sig.split('');

        // Actions mapping based on common YouTube obfuscation patterns
        const actions = {
            reverse: () => s.reverse(),
            slice: (n) => s = s.slice(n),
            swap: (n) => {
                const c = s[0];
                s[0] = s[n % s.length];
                s[n % s.length] = c;
            }
        };

        /**
         * Note: The following sequence is a placeholder for actual deciphering.
         * Real implementations often use a mapping extracted from YouTube's base.js.
         * For this version, we implement a common heuristic.
         */
        try {
            actions.swap(22);
            actions.reverse();
            actions.swap(38);
            actions.slice(2);
            actions.reverse();
            actions.swap(41);
        } catch (err) {
            console.error('[SignatureDecrypter] Transformation sequence failed', err);
        }

        return s.join('');
    }
};
