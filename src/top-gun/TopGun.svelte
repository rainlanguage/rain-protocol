<script>
import { constants } from 'ethers';
import Ethers from '../ethers/Ethers.svelte'
import * as Constants from '../store/Constants'
</script>

<style>
.inner {
  background-image: url('/images/fly.webp'), url('/images/topgun.webp');
  background-size: contain, 25%;
  background-position: center, 90% 5%;
  background-repeat: no-repeat;
  padding-bottom: 300px;
}
</style>

<div class="outer grid grid-cols-12 text-top-gun-collection-1">
  <div class="inner border-top-gun-collection-1 border-8 col-span-9 col-start-4">
    <div class="py-8 px-4">
      <h1 class="text-5xl">Top Gun Collection</h1>

      <Ethers tokenKey="{Constants.bTokenPath}" />
    </div>
  </div>
</div>
