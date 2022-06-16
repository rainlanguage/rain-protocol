import { AutoApproveFactory } from "../../../../typechain/AutoApproveFactory";
import { autoApproveFactoryDeploy } from "../../../../utils/deploy/autoApprove";

describe("AutoApprove evidence data approved op", async function () {
  let autoApproveFactory: AutoApproveFactory;

  before(async () => {
    autoApproveFactory = await autoApproveFactoryDeploy();
  });

  it("should allow checking the given evidence data against prior approved evidence data, preventing the same evidence being used twice", async () => {
    throw new Error("untested");
  });
});
