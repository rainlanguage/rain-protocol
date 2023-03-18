import { readWriteTierDeploy } from "../../utils";
import { registerContract } from "../utils";

export const deployReadWriteTier = async () => {
  const ReadWriteTier = await readWriteTierDeploy();

  registerContract("ReadWriteTier", ReadWriteTier.address);
};
