import powerbiVisualsConfigs from "eslint-plugin-powerbi-visuals";

export default [
    powerbiVisualsConfigs.configs.recommended,
    {
        // build-test.js es el script local de builds de prueba, no forma parte del visual.
        ignores: ["node_modules/**", "dist/**", ".vscode/**", ".tmp/**", "build-test.js"],
    },
];