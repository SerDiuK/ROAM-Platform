module.exports = {
	apps: [
		{
			name: "iot-bridge",
			script: "dist/index.js",
			restart_delay: 3000,
			max_restarts: 10,
		},
	],
};
