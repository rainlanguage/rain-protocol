<script>
	import Tailwindcss from './Tailwindcss.svelte'
	import { Router, Link, Route } from 'svelte-routing'
	import Trade from './dashboard/Trade.svelte'

	export let url = ""
</script>

<Tailwindcss />
<main>
	<Router url="{url}">
	  <nav>
	    <Link to="/trade/pacific-rim-uprising">Pacific Rim Uprising</Link>
	    <Link to="/trade/top-gun">The Top Gun Collection</Link>
	  </nav>
	  <div>
	    <Route path="/trade/:id" let:params>
	      <Trade id="{params.id}" />
	    </Route>
	  </div>
	</Router>
</main>
