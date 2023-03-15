import { readWriteTierDeploy } from "../../utils";
import { registerContract } from "../utils";
import { verifyContract } from "../verify";

export const deployReadWriteTier = async () => {
  const ReadWriteTier = await readWriteTierDeploy();

  registerContract("ReadWriteTier", ReadWriteTier.address);
  verifyContract("ReadWriteTier", ReadWriteTier.address);
};
