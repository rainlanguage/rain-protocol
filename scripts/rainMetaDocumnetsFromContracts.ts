import { writeFile } from "fs";
import { getRainMetaDocumentFromContract } from "../utils";

const main = async () => {
  const config = {
    flow: getRainMetaDocumentFromContract("flow"),
    flowERC20: getRainMetaDocumentFromContract("flow20"),
    flowERC721: getRainMetaDocumentFromContract("flow721"),
    flowERC1155: getRainMetaDocumentFromContract("flow1155"),
  };

  writeFile("./flowMetaDcoument", config.flow, (err) => {
    if (err) console.error(err);
    else console.log("Successfully wrote flowMetaDcoument");
  });

  writeFile("./flow20MetaDcoument", config.flowERC20, (err) => {
    if (err) console.error(err);
    else console.log("Successfully wrote flow20MetaDcoument");
  });

  writeFile("./flow721MetaDcoument", config.flowERC721, (err) => {
    if (err) console.error(err);
    else console.log("Successfully wrote flow721MetaDcoument");
  });

  writeFile("./flow1155MetaDcoument", config.flowERC1155, (err) => {
    if (err) console.error(err);
    else console.log("Successfully wrote flow1155MetaDcoument");
  });
};
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
