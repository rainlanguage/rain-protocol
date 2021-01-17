<script>
  let supply = 1;
  let name = "";
  let symbol = "";

  const handleSubmit = (e) => {
    console.log(e)
    console.log(supply, name, symbol)
  }
</script>

<div>
  <h2>Create a token</h2>

  <div>
    <label>
      Number of tokens to create:<br >
      <input type="number" bind:value={supply} min=1 />
    </label>
  </div>

  <div>
    <label>
      Name of token:<br />
      <input type="text" bind:value={name} placeholder="My Token" />
    </label>
  </div>

  <div>
    <label>
      Symbol/ticker of token:<br />
      <input type="text" bind:value={symbol} placeholder="TKN" />
    </label>
  </div>

  <div>
    <button on:click={handleSubmit}>Submit</button>
  </div>
</div>
