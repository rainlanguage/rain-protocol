import { verifyImplementation } from "../../utils";
import { registerContract } from "../utils";

export const deployVerify = async () => {
  const Verify = await verifyImplementation();

  registerContract("Verify", Verify.address);
};
