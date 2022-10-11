import { FlowTransferStruct } from "../../typechain/contracts/flow/erc1155/FlowERC1155";

/**
 * 
 * @param  
 */
 export const fillEmptyAddress = (flow: FlowTransferStruct, address: string): FlowTransferStruct => {
    
    // native
    for(const native of flow.native){
        if(native.from == "")
            native.from = address;
        else if(native.to == "")
            native.to = address;
    }
    
    // erc20
    for(const erc20 of flow.erc20){
        if(erc20.from == "")
            erc20.from = address;
        else if(erc20.to == "")
            erc20.to = address;
    }
    
    // erc721
    for(const erc721 of flow.erc721){
        if(erc721.from == "")
            erc721.from = address;
        else if(erc721.to == "")
            erc721.to = address;
    }
    
    // erc1155
    for(const erc1155 of flow.erc1155){
        if(erc1155.from == "")
            erc1155.from = address;
        else if(erc1155.to == "")
            erc1155.to = address;
    }

    return flow;
  
};