import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";

import {
  AllStandardOps,
  areEqualExpressionConfigs,
  compareStructs,
  getEventArgs,
  memoryOperand,
  MemoryType,
  op,
} from "../../../../utils";
import {
  rainterpreterDeploy,
  rainterpreterStoreDeploy,
} from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { rainterpreterExpressionDeployerDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";
import deploy1820 from "../../../../utils/deploy/registry1820/deploy";

import { ExpressionAddressEvent, NewExpressionEvent, RainterpreterExpressionDeployer, RainterpreterExpressionDeployerConstructionConfigStruct } from "../../../../typechain/contracts/interpreter/shared/RainterpreterExpressionDeployer";
import { DISpairEvent } from "../../../../typechain/contracts/interpreter/deploy/IExpressionDeployerV1";

describe("Test Rainterpreter Expression Deployer event", async function () {
  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);
  });
  it("DeployExpression event should emit NewExpression data along with correct expression sender", async () => {
    const signers = await ethers.getSigners();

    const interpreter = await rainterpreterDeploy();
    const store = await rainterpreterStoreDeploy();

    const expressionDeployer = await rainterpreterExpressionDeployerDeploy(
      interpreter,
      store
    ); 

    

    const config = {
      constants: ["1", "2"],
      sources: [
        concat([
          op(AllStandardOps.readMemory, memoryOperand(MemoryType.Constant, 0)),
          op(AllStandardOps.readMemory, memoryOperand(MemoryType.Constant, 1)),
          op(AllStandardOps.add, 2),
        ]),
      ],
    };

    const expected = config;
    const tx = await expressionDeployer.deployExpression(
      config.sources,
      config.constants,
      [1]
    );
    const configFromEvent = (await getEventArgs(
      tx,
      "NewExpression",
      expressionDeployer
    )) as NewExpressionEvent["args"]; 

    const expression = (await getEventArgs(
      tx,
      "ExpressionAddress",
      expressionDeployer
    )) as ExpressionAddressEvent["args"];


    const result = {
      sender: signers[0].address,
      constants: configFromEvent.constants,
      sources: configFromEvent.sources,
      minOutputs: [1],
    };

    const mathExpressionConstants = [2, 3];
    const v2 = op(
      AllStandardOps.readMemory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const v3 = op(
      AllStandardOps.readMemory,
      memoryOperand(MemoryType.Constant, 1)
    );

    // prettier-ignore
    const mathExpressionSources = [
      concat([
              v2,
              v2,
              v2,
            op(AllStandardOps.add, 3),
            v3,
          op(AllStandardOps.mul, 2),
          v2,
          v3,
        op(AllStandardOps.div, 3),
      ]),
    ];

    const mathExpressionConfig = {
      constants: mathExpressionConstants,
      sources: mathExpressionSources,
    };

    const expectedMathResult = mathExpressionConfig;
    const mathExpressionTx = await expressionDeployer.deployExpression(
      mathExpressionConfig.sources,
      mathExpressionConfig.constants,
      [1]
    );

    const mathConfigFromEvent = (await getEventArgs(
      mathExpressionTx,
      "NewExpression",
      expressionDeployer
    )) as NewExpressionEvent["args"]; 

    const mathExpression = (await getEventArgs(
      mathExpressionTx,
      "ExpressionAddress",
      expressionDeployer
    )) as ExpressionAddressEvent["args"];

    const mathResult = {
      sender: signers[0].address,
      constants: mathConfigFromEvent.constants,
      sources: mathConfigFromEvent.sources,
      minOutputs: [1],
    }; 

    assert(expression.sender == signers[0].address , "Incorrect sender");
    assert(mathExpression.sender == signers[0].address , "Incorrect sender");


    assert(
      areEqualExpressionConfigs(expected, result),
      `wrong state config
      expected  ${expected}
      got       ${result}`
    );

    assert(
      areEqualExpressionConfigs(expectedMathResult, mathResult),
      `wrong state config
      expected  ${expectedMathResult}
      got       ${mathResult}`
    );
  }); 

  it("DISpair event should emit data with expected config", async () => {

    const interpreter = await rainterpreterDeploy();
    const store = await rainterpreterStoreDeploy();

    const bytes_ =
    "0x789ced5ddd73dbb8117fcf5f81f14b2fad9858f2f9e2decc3d5cefdade4daf492749db874c1e20129231a6080620e5f83af7bf7777017e131469498e7da387c4b208128bdffef603e002fef08cb1ffc13fc6ce12be1167dfb2b3f09acb2496c94d906a198ab399bd1c0913e2e5f7fc4618f6372122c69388bdcb782cbe5f6542b32d8f73b8b4d26ac34cc6c31b6ab0169961d9b5603f14cf656f340f6341cff88361d40b35b537615b2d4c1e676cc90d74a3925a2f85382a151aee0189cedd373249f3ccc017763cf04dca358c096ec26f3fb86f5979bd31ea1508e39eedae1403e65104e218a656249a15979a97ad7f9b0d3fdca0f801afc9dfea23ca35cf240c143b911b013df1cc75752be3982d05c22beb7dba4f1f9fd524385379e65098bb6fe02e40911038b30ac53ba87d5bf13c8efbb56d14882433b171da451c2a0deb3c318c43a35c93b8d93533f932a81aa04435b51ad02bea5955cfe96ab55057856729a7537405e4d952d2903f9ccfd8c5c7672d9df43cc1a21418f9aba83fa61874926f96c067d04501674f5f5fcfd8ab317d5958029944e2735f6774a12097c310a00150fb7abd9ab1f9bcec967e7ef4f2bf014bf1b0495641cf6c52d6a45a70d450a673319a8d1d992af87eeb21ea2a4f42b487b3195866e267ac4a32f1396b93f6e7c4080d34e309732d5828c0886452e71c5bde311c8a4cd6d02cce378965b3bab5242fb838859af6391e6a8ea20b74efd3fbe50ebd9f777dc0306e41d55917bbb1d0e1970ebe3a6c4d2ca71b7917c942c252ae7158efb09129d680708df7bf1eec23b1ccd76dd4bfffcbcf4c24a182df0950916452d77d6cacd6063c70e134afb98e3042001646c56212b21be8a50f57126c8d2a6db7a8e17a3e9983e73de60da341cb2ea52f3f0678c567ed910a6eaf65dcc948dedaf843d700289562c650f9701bb73208648ea1dce19a03c8b1257a24d1db00c28601190e198d6adf53007fcb9335def7012f8349d71b846a03cfa24480120fbd66019b17947b5241a635146cc4fe0463397214da9187959aeecfc2cacb885445a7f136df0f8a37ca5936fbe80e3e4ee8a44df611f96f8f0d7aba58a9380a3c41f45f42af94dea06521089087637ec8d416accae683d49f4ddcf1f7c22f8397848c3115a15c49b80b420576837e859771d6a009eac287334b4f7cd2ad8c207d94491546f43adf803b3478532c92355c2e8d1ada616f07b2d7f9a2116407cc8da41cce1cedc80c5a997549db46eeefb1b5813e9daefc51919084ee70d24476ee5ce1e3495e1be9f948b7e294f2c8b2d73a557af3575096d7b0d7a2636c6f4128308f1b71f79266d12ce552db68856605f3e50c2c4669be166850a9565b59665f70576bfa4ccf38d64c19baeb779f852c8e0ecdc1ec9f38219d838e3ffc05495e4e3e139a3d1bc408023e02d49eba3666a559016163624ab9eef48c95e4db3da5c4667bba9fd30478afdce471b890e10930e51d38f955daeb47508c6023364adfb5adc22edbc0fc17995ffa11e0340552ad3958a9ae1b84b510340b4913409c6b34e77c936c21bb4b7b8985df17aa46f1676dd940aa7a6f6d2d9e8f338f314c23649067a8cc3e73bcdf8cbb4797d4834f89a61b0cfeab41b66e34a8cd602a27764b6d4953ed40714cff5fd17e47c66d23d1682be99b2cd210bdf85d7373dd06f027f88e7d05f3498891d91de01886fc6671f9cd731b18fb916c2f3e1f6e12f86a6012082c5b5cc22c70ba437bf5851d9a2f4c0b1dcee79797c192c73c01bfaf566df5fc5d6484b36b8106099eeaaf6f7fc0fbc0245139f63b1e860a66e913fdd261684e72046ef17f3ce19dc8e36fb0fdecbbb2df42dd3fa9ec68073e6661c7845a3a32bd4a82e0c4e86e77dd0edd8611db4246070c2a7b1b997fa9e52bb7d6f29cbd648b72c1a5618cc3b3fc56281f6bb96d31689de48f6cf1fcfe8b257bf2f600ab2c25a3efed65fa990d441bc3efc5f97d7ccfe2fcf7e779eee7472afc76a09ca98cc781c9d334ee24a005cef66a0fcc5f0e58d301f6de38b9b10fc364129e9a6b95d57d2eef247d2560aef5548622024f90a23b6e28b13b407cec51c558cdd5993e46778f90f59375752ce877dbcce5c5fc2250b74955ec5100fdaeccd1e9720530dec2309842bf49564e855e1c0bd3a2831e58ef8150f9343be801685e2de6f7096e70db29ba592ad610dc0534696300e616079f7e0671b0a948899e1fe2c4e4bafb26577ccaf1bdb714d9c67c659e97ab82992b185a0a4a1f674cbe102fd81a324a2c3ccbae01ef5f85563398bb6f09e9154bd4690abf437b7dab2ddaaac0abb865acc29bc02e10fb6a47a82424d75a00fda97df1367e32fbc72db0b9be02ea6b87e4f47e20e39bb45ff81ed9cb3b468bdf95b633a0baf80956e1b07214d85ffb772bb1ff4d711aab485c2c3aef70f11d2bd8460e922f2ebf71cb5f348c2b66040a9e093667cb3bf8812f035c0de7d1e2e6c4e5c0ab3ef76207eb0503bcde102f5d65293816936ff0c7eba26eb5b62a58f99c2fb15cb178b20ea5cf3801667f458fdc8ed31534949138a9ebf8eab2480fb99a711a83862ac132365b4d7352db71d596da18023f0692ae0dff3ca43cb82c3727a7f810ea7250a3cae023ce31bc3a939d928786ce6472d2d903e9cc424d3a93c9a0ced4600a02974ffa7a9897919bbcb3a3a5a1090856328d65c84f71eae19462f2e59052e032ad869d34f2506e2d37fef2941077aecdafba2b35748571b6929f45c452059aa815ddbf669108e586c754013bbfaa7ebdbd165ac07549e5bbb48e66b5d533e91cd09e56798215907d753e3f4a2d2c7fb0be071b224c89b372a1b5d22447c27010580318a9dbe4053b67dfb11fe1d30ca6c4dfb17fa72f3ce438df51d55f5163e61f400148ef000ab0dcfa979db72f058aaa2df251af70f346b16caf74af5e8d66ee1167f6bd33451c17506d908bf3ab60daacb128f15cb81ab7c692e212ab83445ab4019ed6e95c72760f2f33a4e6a8a5e695d4266b14efb69977c075c8c9ca9d373d50596ad812bca2c06cc44317fe871a81fb313a4fbd2fb1828239ec6c95d2a75d3e2f88eee02b191ec5f7f545b327e201d1c98cf680076461b1205a9ad434aa1d8a438e143bd9b323f7acdc94cb42ef4e9e6a7f8efc1e3c55c11d7254f869986acb4ef1cdbb1ef794a7585b8d568e54ba57ca45ddf5b303940379a4dbbc9aa72fa91fe7250d5b18fb6e5ee0462e2f5f8e969478f5e6aa8195937479b7ff2615ab92ce924d193212b4dc376ffe69fa624729c9eb698ac9b85e8b9a5fec5111eac5366b0427db5da61ea1118f561b7c78bdbfe278d231a3bab7b67e23514980ef999d08f8a23f8eab0c9d0ab0c26b11de187c039d51b4179fa5c18d0d899831111be18a010cbdb06ef9eb696a3f4d60c9670eec90117c2d74203b151c767bcc85ff481352a2d3a1d33ded1781c4ade4006d22a9af5bd82860db35d4da523c7e7fa16dcb2316280ded747e4f873614bb9d41568104e6d984a0987263f08c97acedd5bdd66a176c56eec488a2f31aa42f910be3255871191f4802ea7d054e71cff82dfd8bc2e253cee3a074b5a5843f4064e4da85ce9803d37af3bf4c81ef068752ab2732643b2fe7b50d8b6e70778ca3e7c93ff1b8c53d1ae3cbf3a3bedf9f4fceacf6c25c7cf263be15ddbd715db73eca9bd3e677427743e816a43d79f5daa5c37975c4c9a75657f71560dd57bf6b7776d47f22191d5b50379dda7272677a83dea1516796b5127e7aa4332b577776dcf2990736af75e6d5833464011d8f56cf802a14c9327cdeaba102ac93345fc071ede9fb4d6023880fae5840c47c28ce62678720ec402ddb23a27063ebb49fb0866774d05eb20e06cac45c6118e1561e63e24d1501c194aa4e71e79b2d3f2db9efd678d60a37632fd5966a2c1856e281f765b5ddf7a7d030c1d0408b567d0d851afb6a1e2f0e959cd5ee1858a02b5e0c83e2ab75ba13211e312106d7c9ea2cf1be7b6ebd773eb0b697b1ba65f5687952f03405a3e6bc8988d291d04ba56e82ed3cd87240bddce4d18eb59dfd31e5bd8c6e3c5686518958eccbf04e585b27cefefca6b8f53f8bf181d3ee5e99dad79b624f8b4ddd108fd13d36779d8cedf13dde35251f40e5eebb47a54591ba769a97fca92faef36e1781161b2e13742d6ef74cb215909ff51cc9420ec13566fafd3f5e6392b6b2473ad2ce168387461d897d56de83ec56a327f9873d0231f0b7db5ec374978acd920d263d0148ecb87602403f71dd2a37fdb1a80831d0807c147b87ebdce5f92eddb358dd5957787840615dcd50f5543074a8ec849008d2cb20b0aba7461c3b981163c64dc88e65f03314722b3a931804815a32bea1fd8740a086596196626f25e6204378df09b28f15ab5e10bce0413e2657779815b8fd988e62012f365a35e1b307f1d90977db0cab3d9da571d9c7b3eddc679d0f37b17643c591de736fed58353502a9c57797dd66127211f2fda9d2def3ba6dce8c2d5a789313c4675430a38e548ac93a8fe3bbe2f0512c6a91e1352dd03e9e7ad18f33f6e102ff9b9fef3eefd773fccc51727652cbf14f71689e30eb2eb65e4561831cbc965dfe3ad6448206ec483892ace4268295d2017e3f58b85cce1689aa314c06e3df239f89ca5f139fe7bbf97cf1c07c06c53dc0a15d4885a7cdff16af47ac9d4472d57993dee07fd9946153a1859b642f9c158caae1b7d1175752fc2b2a4be15f4d79ba6f5a70958330f6ea42c422cc8238eba42d9e1dced4be2819acde08d0ab687a215e7a2cdfc1881b057757a5ad851e2173c463c1d7322475e11f0cd8c715d193faca96ec08188cd8f6f62da357ba58cac6933bd6b9af2c51bd98b1f9a893707d7f0da1d63336f91677dacd68b5160f4ec5772d7dfd5ecdd89f874b6317a336073c9dc328b40043274bef1cadd042946626e5590a78602915d950651a86c2825b7ccdf13cabf1b6d7482a7b3a752118f94e4afd05748a1c3fe61ea73c8d78e620299d6ca0494fa36c971e501e4f8df7d9bf0d85c77c51fa508caa6db2649a1d733e48c64067f6d7d3a0c638dc33b5955ada7a468b8387c83bfe3ac6d52853114934289248a271027d3d6c594d8176d8d5140baa53c56f3d59db7aec6dce74881f993a8ccd640d9b71fde0da52d5d77e81ae1c31e23363f5df9d8950047cf6f1d9ff010b3a07ff";
    const expressionDeployerFactory = await ethers.getContractFactory(
      "RainterpreterExpressionDeployer"
    );

    const deployerConfig: RainterpreterExpressionDeployerConstructionConfigStruct =
      {
        interpreter: interpreter.address,
        store: store.address,
        opMeta: bytes_,
      };

    const expressionDeployer = (await expressionDeployerFactory.deploy(
      deployerConfig
    )) as RainterpreterExpressionDeployer; 

    const event_ =  (await getEventArgs(
      expressionDeployer.deployTransaction,
      "DISpair",
      expressionDeployer
    )) as DISpairEvent["args"]; 

    compareStructs(event_,deployerConfig)


  }); 


});
