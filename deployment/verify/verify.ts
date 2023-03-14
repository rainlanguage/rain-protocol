import { RainterpreterExpressionDeployerConstructionConfigStruct } from "../../typechain/contracts/interpreter/shared/RainterpreterExpressionDeployer";
import { getRainMetaDocumentFromOpmeta } from "../../utils";
import { verifyContract } from "../utils";

async function main() {
  const bytes_ = getRainMetaDocumentFromOpmeta();
  const deployerConfig: RainterpreterExpressionDeployerConstructionConfigStruct =
    {
      interpreter: "0xE2f029251D7F0b48ED17d60CfF4a7886388EBCB3",
      store: "0x10147288bBfa2b9A1565683FFB5f8FC0093815CB",
      meta: bytes_,
    };
  await verifyContract(
    "RainterpreterExpressionDeployer",
    "0x8370fe60969B7D604c68A64b7F53633e961236B9",
    deployerConfig
  );
}

main()
  .then(() => {
    const exit = process.exit;
    exit(0);
  })
  .catch((error) => {
    console.error(error);
    const exit = process.exit;
    exit(1);
  });
