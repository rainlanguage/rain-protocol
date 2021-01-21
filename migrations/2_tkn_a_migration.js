const AToken = artifacts.require("AToken");

module.exports = function (deployer) {
  deployer.deploy(AToken);
};
