const ReserveToken = artifacts.require("ReserveToken");

module.exports = function (deployer) {
  deployer.deploy(ReserveToken);
};
