// Debug script untuk troubleshooting bulk move class
console.log('🔍 Debug Bulk Move Class Feature\n');

// Simulate browser environment for testing
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

// Create a mock HTML structure similar to the admin users page
const mockHTML = `
<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
  <div id="bulkActionBar" class="hidden">
    <span id="selectedCount">0</span>
    <select id="bulkMoveClassSelect">
      <option value="">Pilih Kelas Tujuan</option>
      <option value="2">X TKJ 1</option>
      <option value="7">X TKJ 2</option>
      <option value="null">Tanpa Kelas</option>
    </select>
  </div>
  
  <input type="checkbox" class="user-checkbox" data-user-id="1" />
  <input type="checkbox" class="user-checkbox" data-user-id="2" />
  <input type="checkbox" class="user-checkbox" data-user-id="3" />
</body>
</html>
`;

try {
  const dom = new JSDOM(mockHTML);
  global.window = dom.window;
  global.document = dom.window.document;
  global.alert = (msg) => console.log(`🚨 Alert: ${msg}`);
  global.confirm = (msg) => {
    console.log(`❓ Confirm: ${msg}`);
    return true; // Simulate user clicking OK
  };

  // Simulate the JavaScript code from users.ejs
  const userCheckboxes = document.querySelectorAll('.user-checkbox');
  
  // Test 1: Check if elements exist
  console.log('1. Testing DOM elements...');
  console.log(`✅ Found ${userCheckboxes.length} user checkboxes`);
  console.log(`✅ bulkMoveClassSelect exists: ${!!document.getElementById('bulkMoveClassSelect')}`);
  console.log('');

  // Test 2: Simulate checkbox selection
  console.log('2. Simulating checkbox selection...');
  userCheckboxes[0].checked = true;
  userCheckboxes[1].checked = true;
  console.log('✅ Selected 2 checkboxes');
  console.log('');

  // Test 3: Simulate bulkMoveClass function
  console.log('3. Testing bulkMoveClass function...');
  
  // Define the function (copied from the actual implementation)
  window.bulkMoveClass = function() {
    console.log('📞 bulkMoveClass() called');
    
    const selectedIds = Array.from(userCheckboxes)
      .filter(cb => cb.checked)
      .map(cb => cb.getAttribute('data-user-id'));
    
    console.log(`   Selected IDs: [${selectedIds.join(', ')}]`);
    
    if (selectedIds.length === 0) {
      alert('Pilih pengguna yang ingin dipindah kelas terlebih dahulu.');
      return;
    }
    
    const targetClassId = document.getElementById('bulkMoveClassSelect').value;
    console.log(`   Target class ID: "${targetClassId}"`);
    
    if (!targetClassId) {
      alert('Pilih kelas tujuan terlebih dahulu.');
      return;
    }
    
    const targetClassName = targetClassId === 'null' ? 'Tanpa Kelas' : 
      document.querySelector(`#bulkMoveClassSelect option[value="${targetClassId}"]`).textContent;
    
    console.log(`   Target class name: "${targetClassName}"`);
    
    if (!confirm(`Anda yakin ingin memindahkan ${selectedIds.length} pengguna ke kelas "${targetClassName}"?`)) {
      return;
    }
    
    // Create and submit form
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/admin/users/bulk-move-class';
    
    const userIdsInput = document.createElement('input');
    userIdsInput.type = 'hidden';
    userIdsInput.name = 'user_ids';
    userIdsInput.value = JSON.stringify(selectedIds);
    form.appendChild(userIdsInput);
    
    const classIdInput = document.createElement('input');
    classIdInput.type = 'hidden';
    classIdInput.name = 'class_id';
    classIdInput.value = targetClassId === 'null' ? '' : targetClassId;
    form.appendChild(classIdInput);
    
    document.body.appendChild(form);
    
    console.log('   Form created with:');
    console.log(`   - Action: ${form.action}`);
    console.log(`   - Method: ${form.method}`);
    console.log(`   - user_ids: ${userIdsInput.value}`);
    console.log(`   - class_id: "${classIdInput.value}"`);
    
    // Instead of actually submitting, just log what would happen
    console.log('   ✅ Form would be submitted now');
    // form.submit(); // Commented out for testing
  };

  // Test 4: Test with no selection
  console.log('4. Testing with no selection...');
  userCheckboxes.forEach(cb => cb.checked = false);
  document.getElementById('bulkMoveClassSelect').value = '2';
  window.bulkMoveClass();
  console.log('');

  // Test 5: Test with no class selected
  console.log('5. Testing with no class selected...');
  userCheckboxes[0].checked = true;
  document.getElementById('bulkMoveClassSelect').value = '';
  window.bulkMoveClass();
  console.log('');

  // Test 6: Test successful scenario
  console.log('6. Testing successful scenario...');
  userCheckboxes[0].checked = true;
  userCheckboxes[1].checked = true;
  document.getElementById('bulkMoveClassSelect').value = '2';
  window.bulkMoveClass();
  console.log('');

  // Test 7: Test "Tanpa Kelas" scenario
  console.log('7. Testing "Tanpa Kelas" scenario...');
  userCheckboxes[0].checked = true;
  document.getElementById('bulkMoveClassSelect').value = 'null';
  window.bulkMoveClass();
  console.log('');

  console.log('🎉 All debug tests completed!');
  console.log('\n💡 Troubleshooting Tips:');
  console.log('1. Check browser console for JavaScript errors');
  console.log('2. Verify that checkboxes have data-user-id attributes');
  console.log('3. Ensure bulkMoveClassSelect dropdown has proper values');
  console.log('4. Check if the function is properly defined in global scope');
  console.log('5. Verify that the server route /admin/users/bulk-move-class exists');

} catch (error) {
  console.error('❌ Debug test failed:', error.message);
  console.log('\n🔧 Possible Issues:');
  console.log('1. jsdom module not installed (run: npm install jsdom)');
  console.log('2. JavaScript syntax error in the function');
  console.log('3. Missing DOM elements in the actual page');
}