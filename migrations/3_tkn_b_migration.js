const BToken = artifacts.require("BToken");

module.exports = function (deployer) {
  deployer.deploy(BToken);
};
