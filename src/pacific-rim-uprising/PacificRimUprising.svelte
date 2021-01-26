<script>
import Ethers from '../ethers/Ethers.svelte'

export let tick
</script>

<style>
.outer {
  background-image: url('/images/run.webp');
  background-size: 20%;
  background-position: bottom left;
  background-repeat: no-repeat;
}
.inner {
  background-image: url('/images/fist.webp');
  background-size: contain;
  background-position: top right;
  background-repeat: no-repeat;
  padding-bottom: 300px;
}
</style>

<div class="outer grid grid-cols-12 text-pacific-rim-uprising-1">
  <div class="inner border-pacific-rim-uprising-1 border-8 col-span-9 col-start-4">
    <div class="py-8 px-4">
      <h1 class="text-5xl">Pacific Rim Uprising</h1>

      <Ethers tick={tick} tokenKey="AToken" />
    </div>
  </div>
</div>
