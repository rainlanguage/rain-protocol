<script>
	import Tailwindcss from './Tailwindcss.svelte'
	import { Router, Link, Route } from 'svelte-routing'
	import PacificRimUprising from './pacific-rim-uprising/PacificRimUprising.svelte'
	import TopGun from './top-gun/TopGun.svelte'

	export let url = ""
</script>

<Tailwindcss />
<main class="w-full">
	<Router url="{url}">
	  <nav class="grid gap-x-4 justify-items grid-cols-6 p-4">
			<div class="pacific-rim-uprising px-8 py-4 rounded bg-pacific-rim-uprising-1 border-8 text-yellow-50">
		    <Link to="/trade/pacific-rim-uprising">Pacific Rim Uprising</Link>
			</div>

			<div class="top-gun-collection px-8 py-4 rounded border-top-gun-collection-1 border-8 text-top-gun-collection-1">
		    <Link to="/trade/top-gun">The Top Gun Collection</Link>
			</div>

			<div class="redeem px-8 py-4 rounded border-top-gun-collection-1 border-8 text-top-gun-collection-1">
			<Link to="/redeem">Redeem</Link>
			</div>
	  </nav>

    <Route path="/trade/pacific-rim-uprising">
      <PacificRimUprising />
    </Route>
    <Route path="/trade/top-gun">
      <TopGun />
    </Route>
	</Router>
</main>
