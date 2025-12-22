module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/test"],
  moduleNameMapper: {
    "^@taikoproofs/shared$": "<rootDir>/../../packages/shared/src"
  }
};
