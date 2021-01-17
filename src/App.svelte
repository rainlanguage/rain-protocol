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
	  <nav class="grid justify-items-start grid-cols-3 p-4">
			<div class="px-8 py-4 rounded bg-green-400 text-green-50">
		    <Link to="/trade/pacific-rim-uprising">Pacific Rim Uprising</Link>
			</div>
			<div class="px-8 py-4 rounded bg-green-400 text-green-50">
		    <Link to="/trade/top-gun">The Top Gun Collection</Link>
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
