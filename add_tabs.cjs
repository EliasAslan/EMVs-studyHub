var fs = require('fs');
var c = fs.readFileSync('C:\\Users\\e3953\\Documents\\GitHub/EMVs-studyHub/src/lib/views/Settings.svelte', 'utf8');
// Add tab navigation before the page div
var pageDivIndex = c.indexOf('<div class="page">');
if (pageDivIndex > 0) {
  var tabNav = '\n  <!-- Tab navigation -->\n  <nav class="settings-tabs" aria-label="Einstellungsbereiche">\n    <button\n      class:active={activeTab === \'appearance\'}\n      type=\"button\"\n      on:click={() => (activeTab = \'appearance\')}\n    >\n      <Icon name=\"palette\" size={16} /> Erscheinungsbild\n    </button>\n    <button\n      class:active={activeTab === \'home\'}\n      type=\"button\"\n      on:click={() => (activeTab = \'home\')}\n    >\n      <Icon name=\"today\" size={16} /> Heute\n    </button>\n    <button\n      class:active={activeTab === \'behaviour\'}\n      type=\"button\"\n      on:click={() => (activeTab = \'behaviour\')}\n    >\n      <Icon name=\"cog\" size={16} /> Verhalten\n    </button>\n  </nav>\n';
  c = c.substring(0, pageDivIndex) + tabNav + c.substring(pageDivIndex);
  fs.writeFileSync('C:\\Users\\e3953\\Documents\\GitHub/EMVs-studyHub/src/lib/views/Settings.svelte', c);
  console.log('Tab navigation added');
} else {
  console.log('page div not found');
}