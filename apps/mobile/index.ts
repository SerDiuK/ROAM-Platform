// Polyfills must come before anything that imports @solana/web3.js or MWA.
// `buffer` is referenced internally by web3.js (Transaction.serialize, PublicKey
// .toBuffer, etc.) and by our mwa.ts. RN doesn't ship a Buffer global.
//
// `react-native-get-random-values` is a separate native dep also required by
// web3.js (for ephemeral keypair gen + secure nonces). Add it once we need a
// rebuild for another reason — MWA handles its own randomness via the Android
// native side, so the dApp side gets by without it for the current flows.
import { Buffer } from "buffer";

// `globalThis.Buffer` is the closest-to-spec install. RN's Hermes engine has
// `global` aliased to `globalThis`, so this single assignment covers both
// scopes that web3.js / MWA might reach through.
if (typeof globalThis.Buffer === "undefined") {
	globalThis.Buffer = Buffer;
}

import "@expo/metro-runtime";
import { registerRootComponent } from "expo";
import { App } from "./App";

registerRootComponent(App);
