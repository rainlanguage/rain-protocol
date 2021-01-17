<script>
import { ethers } from "ethers"

const provider = new ethers.providers.JsonRpcProvider('http://localhost:7545', ethers.networks.unspecified)
provider.getBlockNumber().then((data) => console.log(data))
// const signer = provider.getSigner()

// console.log(signer)
// console.log(await provider.getBlockNumber())

</script>

<style>
.frame {
  background-image: url('/images/robot-1.webp');
  background-size: contain;
  background-position: bottom left;
  background-repeat: no-repeat;
  padding-bottom: 500px;
}
</style>

<div class="grid grid-cols-12">
  <div class="frame border-green-100 border-8 col-span-8 col-start-2">
    <div class="py-8 px-4">
      <h1>Hi!</h1>
    </div>
  </div>
</div>
