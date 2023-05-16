import { artifacts, ethers } from "hardhat";
import { arrayify } from "@rainprotocol/rainlang";
import { RainterpreterExpressionDeployer } from "../../../typechain";
import {
  CloneFactory,
  DeployerDiscoverableMetaV1ConstructionConfigStruct,
} from "../../../typechain/contracts/factory/CloneFactory";
import { deflateJson } from "../../meta";
import { cborEncode, MAGIC_NUMBERS } from "../../meta/cbor";
import { getTouchDeployer } from "../interpreter/shared/rainterpreterExpressionDeployer/deploy";

export const flowCloneFactory = async () => {
  // Get Touch Deployer
  const touchDeployer: RainterpreterExpressionDeployer =
    await getTouchDeployer();

  const metaDocumentHex =
    "0x" + MAGIC_NUMBERS.RAIN_META_DOCUMENT.toString(16).toLowerCase();

  // Get ABI clone abi and deflate it
  const cloneAbi = deflateJson(artifacts.readArtifactSync("CloneFactory").abi);
  const abiJson = arrayify(cloneAbi).buffer;

  const abiEncoded = cborEncode(
    abiJson,
    MAGIC_NUMBERS.SOLIDITY_ABIV2,
    "application/json",
    {
      contentEncoding: "deflate",
    }
  );

  const meta = metaDocumentHex + abiEncoded;

  const config_: DeployerDiscoverableMetaV1ConstructionConfigStruct = {
    meta: meta,
    deployer: touchDeployer.address,
  };

  const factory = await ethers.getContractFactory("CloneFactory");

  const contract = await factory.deploy(config_);

  await contract.deployed();

  return contract as CloneFactory;
};
