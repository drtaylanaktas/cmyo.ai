const date = new Date();
const istanbulTime = date.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'full', timeStyle: 'short' });
console.log("Raw Date:", date.toISOString());
console.log("Istanbul Time:", istanbulTime);

// Test explicit day calculation
const options = { timeZone: 'Europe/Istanbul', weekday: 'long' };
const dayName = new Intl.DateTimeFormat('tr-TR', options).format(date);
console.log("Day Name:", dayName);
