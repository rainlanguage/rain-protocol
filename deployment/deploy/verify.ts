import { verifyImplementation } from "../../utils";
import { registerContract } from "../utils";
import { verifyContract } from "../verify";

export const deployVerify = async () => {
  const Verify = await verifyImplementation();

  registerContract("Verify", Verify.address);
  verifyContract("Verify", Verify.address);
};
