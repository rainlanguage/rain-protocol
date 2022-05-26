/**
 *
 * @returns {number} Current timestamp in seconds
 */
export const timestamp = () => Math.floor(Date.now() / 1000);

export const sleep = (timeout) =>
  new Promise((res) => setTimeout(res, timeout));
