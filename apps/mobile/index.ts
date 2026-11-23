// RN has no global Buffer; @solana/web3.js and the wallet adapter expect one at call time.
import { Buffer } from "buffer";

if (typeof globalThis.Buffer === "undefined") {
	globalThis.Buffer = Buffer;
}

import "@expo/metro-runtime";
import { registerRootComponent } from "expo";
import { App } from "./src/app";

registerRootComponent(App);
