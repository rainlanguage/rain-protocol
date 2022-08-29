import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { artifacts, ethers } from "hardhat";
import { EmissionsERC20 } from "../../typechain";
import { EmissionsERC20Factory } from "../../typechain";
import { EmissionsERC20ConfigStruct } from "../../typechain/contracts/claim/EmissionsERC20";
import { getEventArgs } from "../events";

export const emissionsDeploy = async (
  creator: SignerWithAddress,
  emissionsERC20Factory: EmissionsERC20Factory,
  emissionsERC20ConfigStruct: EmissionsERC20ConfigStruct
): Promise<EmissionsERC20> => {
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
  ) as EmissionsERC20;

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  emissionsERC20.deployTransaction = tx;

  return emissionsERC20;
};
