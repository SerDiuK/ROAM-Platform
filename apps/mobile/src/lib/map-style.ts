import type { MapStyleElement } from "react-native-maps";

// Dark dispatch map style — desaturated landscape, dimmed roads,
// high-contrast text. Applied via MapView's `customMapStyle` on Android only;
// Apple Maps on iOS does not support custom JSON styles.
export const DISPATCH_MAP_STYLE: MapStyleElement[] = [
	{ elementType: "geometry", stylers: [{ color: "#11161a" }] },
	{ elementType: "labels.text.fill", stylers: [{ color: "#8a8a8a" }] },
	{ elementType: "labels.text.stroke", stylers: [{ color: "#0f1419" }] },
	{
		featureType: "administrative.country",
		elementType: "geometry.stroke",
		stylers: [{ color: "#3d4a52" }],
	},
	{
		featureType: "administrative.land_parcel",
		stylers: [{ visibility: "off" }],
	},
	{
		featureType: "administrative.locality",
		elementType: "labels.text.fill",
		stylers: [{ color: "#a8a8a8" }],
	},
	{
		featureType: "administrative.neighborhood",
		stylers: [{ visibility: "off" }],
	},
	{
		featureType: "administrative.province",
		elementType: "geometry.stroke",
		stylers: [{ color: "#2a3338" }],
	},
	{ featureType: "poi", stylers: [{ visibility: "off" }] },
	{
		featureType: "landscape.man_made",
		elementType: "geometry",
		stylers: [{ color: "#161c20" }],
	},
	{
		featureType: "landscape.natural",
		elementType: "geometry",
		stylers: [{ color: "#11161a" }],
	},
	{
		featureType: "road",
		elementType: "geometry",
		stylers: [{ color: "#1f2a30" }],
	},
	{
		featureType: "road",
		elementType: "labels.text.fill",
		stylers: [{ color: "#5a6670" }],
	},
	{
		featureType: "road.arterial",
		elementType: "geometry",
		stylers: [{ color: "#283036" }],
	},
	{
		featureType: "road.highway",
		elementType: "geometry",
		stylers: [{ color: "#3a464d" }],
	},
	{
		featureType: "road.highway",
		elementType: "geometry.stroke",
		stylers: [{ color: "#1a2228" }],
	},
	{ featureType: "transit", stylers: [{ visibility: "off" }] },
	{
		featureType: "water",
		elementType: "geometry",
		stylers: [{ color: "#0a0d10" }],
	},
	{
		featureType: "water",
		elementType: "labels.text.fill",
		stylers: [{ color: "#3d4a52" }],
	},
];
