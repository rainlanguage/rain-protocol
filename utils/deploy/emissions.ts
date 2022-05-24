import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Contract } from "ethers";
import {
  EmissionsERC20ConfigStruct,
  EmissionsERC20Factory,
} from "../../typechain/EmissionsERC20Factory";
import { EmissionsERC20 } from "../../typechain/EmissionsERC20";
import { artifacts, ethers } from "hardhat";
import { getEventArgs } from "../events";

export const emissionsDeploy = async (
  creator: SignerWithAddress,
  emissionsERC20Factory: EmissionsERC20Factory & Contract,
  emissionsERC20ConfigStruct: EmissionsERC20ConfigStruct
): Promise<EmissionsERC20 & Contract> => {
  const tx = await emissionsERC20Factory.createChildTyped(
    emissionsERC20ConfigStruct
  );

  const emissionsERC20 = new ethers.Contract(
    ethers.utils.hexZeroPad(
      ethers.utils.hexStripZeros(
        (await getEventArgs(tx, "NewChild", emissionsERC20Factory)).child
      ),
      20 // address bytes length
    ),
    (await artifacts.readArtifact("EmissionsERC20")).abi,
    creator
  ) as EmissionsERC20 & Contract;

  return emissionsERC20;
};
