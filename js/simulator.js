var attrNames = [ 'str', 'int', 'cmd', 'dex', 'lck' ]; // attribute name
var statNames = [ 'atk', 'wis', 'def', 'agi', 'mrl' ]; // stat name
var slotNames = { 4: 'weapon', 5: 'armor', 6: 'kit' }; // artifact slot name
var weatherNames = [ '맑음', '흐림', '비', '연환뢰', '눈' ]; // Sun, Clouds, Rain, Thunderstorm, Snow

var banTactics = [ 2000010, 2000015, 2000022, 2000078, 2000079, 2000090, 2000094, 2000099, 2000110 ];
var epTactics = [ 2000120, 2000121, 2000122 ];

// Note: not include bloody battle in Annihilation (after 10th turn, 228-232 +20%)
var pvpMaps = [
	{ name: '익주, 산지 전투', tiles: [4200005, 4200003], weather: [ 60, 16, 16, 8, 0 ] }, // mountain
	{ name: '병주, 설원 전투', tiles: [4200008, 4200033], weather: [ 33, 33, 0, 0, 34 ] }, // snow
	{ name: '기주, 초원 전투', tiles: [4200001, 4200002], weather: [ 68, 16, 16, 0, 0 ] }, // grassland
	{ name: '옹주, 사막 전투', tiles: [4200004, 4200032], weather: [ 68, 16, 16, 0, 0 ] }, // desert
	{ name: '사주, 도성 전투', tiles: [4200017, 4200024], weather: [ 20, 50, 30, 0, 0 ] }, // castle
	{ name: '양주, 장강 전투', tiles: [4200014, 4200011], weather: [ 24, 36, 24, 16, 0 ] },  // river
];
var brawlMaps = [
	{ name: '난투', tiles: [4200060], weather: [ 20, 20, 20, 20, 20 ] } // Brawl
];

var gameModes = [ // assume all unit lv is 99
	{ name: '경쟁전', suffix: '', maps: pvpMaps, hpMul: 1.5, hasFormation: true, p0bonus: 0, p1bonus: 0 },  // pvp
	{ name: '난투',  suffix: '', maps: brawlMaps, hpMul: 2, hasFormation: false, p0bonus: 0, p1bonus: 0 },
	{ name: '섬멸전', suffix: ' - Player first', maps: pvpMaps, hpMul: 1.5, hasFormation: true, p0bonus: 0, p1bonus: 10 },
	{ name: '섬멸전', suffix: ' - AI first',     maps: pvpMaps, hpMul: 1.5, hasFormation: true, p0bonus: 3, p1bonus: 7 },
];
var gameModeId = 0;
var gameMode = gameModes[gameModeId];
var mapId = 0;
var weatherId = 0; // 0-4

// the mono Math.RoundToInt()
function monoMathRound(val) {
	return ((val % 2) == 0.5) ? Math.floor(val) : Math.round(val);
}

function mathClamp(num, lower, upper) {
  return (num <= lower) ? lower : ((num >= upper) ? upper : num);
}

function isAlmightyJob(unitTypeId) {
	return ([1210001, 1210016, 1210022, 1210069].indexOf(unitTypeId) !== -1);
}

function isCavalryUnit(unitTypeId) {
	return ([1210006, 1210007, 1210008, 1210009, 1210017, 1210032, 1210001, 1210069, 1210070, 1210078].indexOf(unitTypeId) !== -1);
}

function getResearchAtkBonus(weaponType) {
	// assume max research
	// catapult, fan, jeweled sword is 40
	if (weaponType === 6 || weaponType === 7 || weaponType === 8)
		return 40;
	return 50;
}

function getCurrentMapInfo() {
	return gameMode.maps[mapId];
}

function _getRelicPassiveValue(relicPassive, relicLv, attrs) {
	var attrVal = Math.min(attrs[attrNames[relicPassive['statType']]], 200);
	return relicPassive['vals'][relicLv - 1] * attrVal / 20000;
}

function getItemEnhancePassiveList(itemEnhancePassive) {
	return passiveLists[itemEnhancePassive['passiveListId']];
}

function findItemEnhance(itemTier, eType, lv) {
	if (lv === 0)
		return null;
	for (var enhanceId in itemEnhances) {
		var itemEnhance = itemEnhances[enhanceId];
		if (itemTier === itemEnhance['itemTier'] && eType === itemEnhance['enhanceType'] && lv === itemEnhance['enhanceLv'])
			return itemEnhance;
	}
	return null;
}

function _findArtifactEnhanceType(artifact) {
	if (artifact['itemType'] <= 6) {
		// physical weapon (type: 1,2,3,4,5,6)
		return [1];
	}
	else if (artifact['itemType'] <= 8) {
		// legendary sword, fan
		if (artifact['itemType'] === 8 || artifact['id'] === 3016043)
			return [3,1];
		return [3];
	}
	else if (artifact['itemType'] <= 11) {
		return [5]; // armor/robe/dress
	}
	return [8]; // acc
}

function _findRelicSet(relics) {
	var rtype = relics[0]['type'];
	var tier = relics[0]['tier'];
	var hash = rtype << 7;
	for (var i = 0; i < relics.length; i++) {
		if (rtype !== relics[i]['type']) {
			hash = 0;
			break;
		}
		if (relics[i].tier < tier)
			tier = relics[i].tier;
		hash |= (1 << relics[i].mainStat);
	}
	// find relicSet from hash. need to loop all because there might be better set grade
	var result = null;
	for (var relicSetId in relicSets) {
		var relicSet = relicSets[relicSetId];
		if (relicSet['minTier'] <= tier && relicSet['hash'] === hash)
			result = relicSet;
	}
	return result;
}

function _findObjId(obj, objDict) {
	for (objId in objDict) {
		if (objDict[objId] === obj)
			return Number(objId);
	}
	return 0;
}

function _findObj(objId, objArr) {
	for (var i = 0; i < objArr.length; i++) {
		if (objArr[i].id === objId)
			return objArr[i];
	}
	return null;
}

function _artifact2SerializedObj(equipInfo) {
	var p6 = equipInfo['p6'] ? _findObjId(equipInfo['p6'], itemEnhancePassives) : 0;
	var p12 = equipInfo['p12'] ? _findObjId(equipInfo['p12'], itemEnhancePassives) : 0;
	return [ equipInfo['item']['id'], equipInfo['lv'], p6 ? p6 - 2700000 : 0, p12 ? p12 - 2700000 : 0 ];
}

function _userUnit2SerializeObj(uinfo, doFull=false) {
	var outObj = {
		'id': uinfo.unit['id'] - 1100000,
		'eW': _artifact2SerializedObj(uinfo['weapon']),
		'eA': _artifact2SerializedObj(uinfo['armor']),
		'eK': _artifact2SerializedObj(uinfo['kit']),
		'sP': uinfo.selectedPassiveLists,
		'r': new Array(4),
		'rP': new Array(4),
		'rPL': new Array(4),
		'sc': [ uinfo.scrolls['str'], uinfo.scrolls['int'], uinfo.scrolls['cmd'], uinfo.scrolls['dex'], uinfo.scrolls['lck'] ],
		'bf': [ uinfo.formationId, uinfo.formationPos ],
	};
	for (var i = 0; i < 4; i++) {
		outObj.r[i] = _findObjId(uinfo.relics[i], relics) - 13000000;
		outObj.rP[i] = _findObjId(uinfo.relicPassives[i], relicPassives) - 13010000;
		outObj.rPL[i] = uinfo.relicPassivesLv[i];
	}
	if (doFull) {
		// hp/mp
		outObj.hp = uinfo.hp;
		outObj.mp = uinfo.mp;
		// battle passive
		var bp = {}
		for (var i = 0; i < uinfo.battlePassives.length; i++) {
			var battlePassive = uinfo.battlePassives[i];
			if (battlePassive.type === 0)
				continue; // auto active (no need to serialize)
			if (battlePassive.defaultVal === battlePassive.userVal)
				continue;
			bp[battlePassive.id-2200000] = battlePassive.userVal;
		}
		outObj.bp = bp;
		
		// buff/debuff
		var cd = []
		for (var i = 0; i < uinfo.conditions.length; i++) {
			var condition = uinfo.conditions[i];
			if (condition.userIdx === -1)
				continue;
			cd.push(condition.allowIds[condition.userIdx] - 2100000);
		}
		outObj.cd = cd;
		// terrain
		outObj.tr = [ uinfo.tileId, uinfo.isFlameTile ? 1 : 0 ];
		// tactic
		outObj.tt = uinfo.tactic.id-2000000;
	}
	
	return outObj;
}

function serializeUserUnit(uinfo, doFull=false) {
	var txt = JSON.stringify(_userUnit2SerializeObj(uinfo, doFull));
	//console.log(txt);
	return txt;
}

function _unserializeArtifact(info) {
	var item = _findObj(info[0], artifacts);
	return {
		'item': item,
		'lv': info[1],
		'p6': info[2] ? itemEnhancePassives[info[2] + 2700000] : null,
		'p12': info[3] ? itemEnhancePassives[info[3] + 2700000] : null,
		'enhance': findItemEnhance(item.tier, _findArtifactEnhanceType(item)[0], info[1])
	};
}

function _serializedObj2UserUnit(sobj, uid) {
	var unit = _findObj(sobj.id + 1100000, units);	
	var uinfo  = getDefaultUnitInfo(unit, uid);
	uinfo.weapon = _unserializeArtifact(sobj.eW);
	uinfo.armor = _unserializeArtifact(sobj.eA);
	uinfo.kit = _unserializeArtifact(sobj.eK);
	uinfo.selectedPassiveLists = sobj.sP;
	uinfo.scrolls = { 'str': sobj.sc[0], 'int': sobj.sc[1], 'cmd': sobj.sc[2], 'dex': sobj.sc[3], 'lck': sobj.sc[4] };
	for (var i = 0; i < 4; i++) {
		uinfo.relics[i] = relics[sobj.r[i] + 13000000];
		uinfo.relicPassives[i] = relicPassives[sobj.rP[i] + 13010000];
		uinfo.relicPassivesLv[i] = sobj.rPL[i];
	}
	uinfo.relicSet = _findRelicSet(uinfo.relics);
	if ('bf' in sobj) {
		uinfo.formationId = sobj.bf[0];
		uinfo.formationPos = sobj.bf[1];
	}
	if ('bp' in sobj) {
		for (var i = 0; i < uinfo.battlePassives.length; i++) {
			var battlePassive = uinfo.battlePassives[i];
			if (battlePassive.type === 0)
				continue; // auto active (no data)
			var sid = battlePassive.id-2200000;
			if (sid in sobj.bp)
				battlePassive.userVal = sobj.bp[sid];
		}
	}
	if ('cd' in sobj) {
		for (var i = 0; i < uinfo.conditions.length; i++) {
			var condition = uinfo.conditions[i];
			for (var j = 0; j < condition.allowIds.length; j++) {
				if (sobj['cd'].indexOf(condition.allowIds[j]-2100000) !== -1) {
					condition.userIdx = j;
					break;
				}
			}
		}
	}
	if ('tr' in sobj) {
		// need UI to handle explicitly
		uinfo.tileId = sobj.tr[0];
		uinfo.isFlameTile = (sobj.tr[1] === 1);
	}
	if ('tt' in sobj)
		uinfo.tactic = _findObj(sobj.tt+2000000, tactics);
	
	var hp = ('hp' in sobj) ? sobj.hp : 0;
	var mp = ('mp' in sobj) ? sobj.mp : 0;
	
	uinfo.initializeData(hp, mp);
	return uinfo;
}

function unserializeUserUnit(uid, txt) {
	try {
		var sobj = JSON.parse(txt);
	} catch (e) {
		return null;
	}
	
	var uinfo = _serializedObj2UserUnit(sobj, uid);
	return uinfo;
}

function serializeGameInfo() {
	var p0obj = _userUnit2SerializeObj(punits['p0'], true);
	var p1obj = _userUnit2SerializeObj(punits['p1'], true);
	var outObj = {
		'gid': gameModeId,
		'mid': mapId,
		'wid': weatherId,
		'p0': p0obj,
		'p1': p1obj,
	};
	var txt = JSON.stringify(outObj);
	//console.log(txt);
	return txt;
}

function unserializeGameInfo(txt) {
	try {
		var sobj = JSON.parse(txt);
	} catch (e) {
		return null;
	}
	
	gameModeId = sobj.gid;
	gameMode = gameModes[gameModeId];
	mapId = sobj.mid;
	weatherId = sobj.wid;
	punits['p0'] = _serializedObj2UserUnit(sobj.p0, 'p0');
	punits['p1'] = _serializedObj2UserUnit(sobj.p1, 'p1');
}

function getDefaultArtifactUpgradePassive(info) {
	var weapon = info['weapon']['item'];
	if (info.attackRole === 'Magic') {
		// legendary sword, fan
		// 2700016: +3% tactic
		info['weapon']['p6'] = itemEnhancePassives[2700016];
		info['armor']['p6'] = itemEnhancePassives[2700016];
		info['kit']['p6'] = itemEnhancePassives[2700016];
		// 2701247: offensive tactic preparation
		info['weapon']['p12'] = itemEnhancePassives[2701247];
		// 2702526: Grassland: WIS Boost +64
		info['kit']['p12'] = itemEnhancePassives[2702526];
		
		info['weapon']['enhance'] = findItemEnhance(weapon['tier'], 3, info['weapon']['lv']);
	}
	else {
		// physical weapon (type: 1,2,3,4,5,6)
		// 2700013: +10 dmg
		info['weapon']['p6'] = itemEnhancePassives[2700013];
		info['armor']['p6'] = itemEnhancePassives[2700013];
		info['kit']['p6'] = itemEnhancePassives[2700013];
		// 2700579: spectral
		info['weapon']['p12'] = itemEnhancePassives[2700579];
		// 2702508: Grassland: ATK Boost +64
		info['kit']['p12'] = itemEnhancePassives[2702508];
		
		info['weapon']['enhance'] = findItemEnhance(weapon['tier'], 1, info['weapon']['lv']);
	}
	
	// 2701760: Defense: Max Damage Defense %
	info['armor']['p12'] = itemEnhancePassives[2701760];
	
	info['armor']['enhance'] = findItemEnhance(info['armor']['item']['tier'], 5, info['armor']['lv']);
	info['kit']['enhance'] = findItemEnhance(info['kit']['item']['tier'], 8, info['kit']['lv']);
}

function getDefaultRelicInfo(uinfo) {
	var weapon = uinfo.weapon.item;
	if (uinfo.attackRole === 'Magic') {
		uinfo.relicSet = relicSets[13030028]; // scorching Lighting Plan
		uinfo.relicPassives = new Array(4).fill(relicPassives[13010003]); // amplify offensive tactics
	}
	else {
		uinfo.relicSet = relicSets[13030011]; // claw
		if (uinfo.attackRole === 'Melee')
			uinfo.relicPassives = new Array(4).fill(relicPassives[13010001]); // melee attack+
		else
			uinfo.relicPassives = new Array(4).fill(relicPassives[13010002]); // range attack+
	}
	
	uinfo.relicPassivesLv = new Array(4).fill(5);
	
	uinfo.relics = new Array(4);
	for (var i = 0; i < uinfo.relicSet.relicIds.length; i++) {
		uinfo.relics[i] = relics[uinfo.relicSet.relicIds[i]];
	}
}

function getDefaultUnitTerrainId(uinfo) {
	var battleMap = getCurrentMapInfo();
	if (battleMap.tiles.indexOf(uinfo.tileId) === -1)
		uinfo.tileId = battleMap.tiles[0];
}

function getDefaultUnitInfo(unit, id) {
	var uinfo = new UserUnit(unit, id);
	
	// create list of commander passives (selectable from unit type and specific commander)
	uinfo.commanderPasiveLists = new Array(9); // 5+4
	for (var i = 0; i < uinfo.unitType['passives'].length; i++)
		uinfo.commanderPasiveLists[i] = passiveLists[uinfo.unitType['passives'][i]];
	for (var i = 0; i < unit["passiveListIds"].length; i++)
		uinfo.commanderPasiveLists[i+5] = passiveLists[unit["passiveListIds"][i]];
	// last 3 commander passives as default
	uinfo.selectedPassiveLists = [ 6, 7, 8];
	var passiveIds = [ uinfo.commanderPasiveLists[6].passiveId, uinfo.commanderPasiveLists[7].passiveId, 
						uinfo.commanderPasiveLists[8].passiveId ];
	
	if (uinfo.allowItemTypes[1] === 9)
		uinfo.armor.item = _findObj(3060270, artifacts); // Gold Breastplate
	else if (uinfo.allowItemTypes[1] === 11)
		uinfo.armor.item = _findObj(3020072, artifacts); // Elephant Skin Robe
	else if (uinfo.allowItemTypes[1] === 10) {
		var hasDefSwitch = (passiveIds.indexOf(2200105) !== -1);
		if (hasDefSwitch)
			uinfo.armor.item = _findObj(3019046, artifacts); // antidouble attack
		else if (unit.jobTypeId === 1210041) // demon
			uinfo.armor.item = _findObj(3019045, artifacts); // def stat switch
		else
			uinfo.armor.item = _findObj(3060301, artifacts); // mental ex
	}
	
	var wantedWeaponPassiveId;
	if (uinfo.attackRole === 'Magic') {
		if (passiveIds.indexOf(2200024) === -1)
			wantedWeaponPassiveId = 2200024; // double tactics
		else
			wantedWeaponPassiveId = 2200024; // tactic def rate pierce
		uinfo.kit.item = _findObj(3040744, artifacts); // sun bin
	}
	else {
		if (passiveIds.indexOf(2200418) !== -1)
			wantedWeaponPassiveId = 2200418; // double deadly
		else if (passiveIds.indexOf(2200022) !== -1 && passiveIds.indexOf(2200023) !== -1) {
			if (uinfo.attackRole === 'Range')
				wantedWeaponPassiveId = 2200183; // guiding if has leading/chain
			else
				wantedWeaponPassiveId = 2200099; // pene if has leading/chain
		}
		else
			wantedWeaponPassiveId = 2200023; // chain
		uinfo.kit.item = _findObj(3040316, artifacts); // musk
	}
	
	var hasWeapon = false;
	for (var i = 0; i < artifacts.length; i++) {
		var item = artifacts[i];
		if (item['tier'] !== 7)
			continue;
		if (uinfo.allowItemTypes.indexOf(item['itemType']) === -1)
			continue;  // this unit cannot equip this artifact
		
		// commander specific (priority)
		if (item['unitId'] === unit['id']) {
			if (item['slot'] === 4) {
				uinfo.weapon.item = item;
				hasWeapon = true;
			}
			else {
				uinfo.kit.item = item;
			}
		}
		
		if (item['slot'] === 4) {
			if (!hasWeapon) {
				if (item.passive[0] === wantedWeaponPassiveId) {
					uinfo.weapon.item = item;
					hasWeapon = true;
				}
			}
		}
	}
	
	getDefaultArtifactUpgradePassive(uinfo);
	getDefaultRelicInfo(uinfo);
	
	getDefaultUnitTerrainId(uinfo);
	if (uinfo.unit['ep'] === 0)
		uinfo.tactic = tactics[0];
	else
		uinfo.tactic = tactics[93];
	
	uinfo.formationId = 0;
	uinfo.formationPos = 0; // front
	
	return uinfo;
}

function SpActionList(uinfo) {
	this.uinfo = uinfo;
	this.spList = {};
	
	this.addSpAction = function(passiveId, passiveVal) {
		var passive = passives[passiveId];
		// +12 kit passive has tile condition. check it
		if (passive.triggerTileValue !== 0 && this.uinfo.tileId !== passive.triggerTileValue)
			return;
		var rootPassiveId = passive.parentId ? passive.parentId : passiveId;
		if (!(rootPassiveId in this.spList))
			this.spList[rootPassiveId] = [];
		var spActionArr = this.spList[rootPassiveId];
		var spAction = null;
		for (var i = 0; i < spActionArr.length; i++) {
			if (spActionArr[i]['id'] === passiveId) {
				spAction = spActionArr[i];
				break;
			}
		}
		if (spAction === null) {
			spAction = { 'id': passiveId, 'val': 0, 'passive': passive };
			// default disable all chance to trigger passive
			spAction['enabled'] = (passive.triggerType === 0) ? true: false;
			// set main at first of array
			if (passiveId === rootPassiveId)
				spActionArr.unshift(spAction);
			else
				spActionArr.push(spAction);
		}
		if (passive['accumulate']) {
			spAction['val'] += passiveVal;
		}
		else if (passiveVal > spAction['val']) {
			spAction['val'] = passiveVal;
		}
	};
	
	this.addSpActionFromPassiveList = function(passiveList) {
		this.addSpAction(passiveList['passiveId'], passiveList['val']);
	};
	
	this.addSpActionFromArtifact = function(artifactInfo) {
		var item = artifactInfo.item;
		for (var i = 0; i < item.passive.length; i++)
			this.addSpAction(item.passive[i], item.passiveVal[i]);
		
		if (artifactInfo.lv !== 0) {
			this.addSpActionFromPassiveList(passiveLists[artifactInfo.enhance.passiveListId]);
			if (artifactInfo.lv >= 6 && artifactInfo.p6)
				this.addSpActionFromPassiveList(getItemEnhancePassiveList(artifactInfo.p6));
			if (artifactInfo.lv == 12 && artifactInfo.p12)
				this.addSpActionFromPassiveList(getItemEnhancePassiveList(artifactInfo.p12));
		}
	};
	
	// defaultVal is value to be returned if no passive
	this.getPassiveTotalVal = function(passiveId, defaultVal=0) {
		if (passiveId in this.spList) {
			var spActionArr = this.spList[passiveId];
			var val = 0;
			for (var i = 0; i < spActionArr.length; i++) {
				if (spActionArr[i]['enabled'])
					val += spActionArr[i]['val'];
			}
			return val;
		}
		
		return defaultVal;
	};
	
	this.hasPassive = function(passiveId) {
		return (passiveId in this.spList);
	};
	
	this.getPassiveGroup = function(passiveId) {
		if (!(passiveId in this.spList))
			return null;
		var spActionArr = this.spList[passiveId];
		for (var i = 0; i < spActionArr.length; i++) {
			if (spActionArr[i]['passive'].triggerType !== 0)
				return spActionArr;
		}
		return null;
	};
}

function _getUnitAttackRole(weaponItemType) {
	if (weaponItemType > 6)
		return "Magic";
	
	if ([1,2,5].indexOf(weaponItemType) !== -1)
		return "Melee"; // sword, spear, staff
	
	return "Range"; // bow, xbow, cata
}

function _getPassiveTerrainAdv(passiveId, tileId, isFlameTile) {
	var val = 0;
	var tileAdvs = passives[passiveId].tileAdvs;
	if (tileId in tileAdvs) {
		val = tileAdvs[tileId];
		if (isFlameTile)
			val -= 10;
	}
	return val;
}

// callback when info is changed (need update UI)
var onUserUnitInfoChangedCb = null;
// Note: many internal UserUnit big method is defined as function outside to reduce the length of the class
function UserUnit(unit, id) {
	this.unit = unit;
	this.id = id;
	this.lv = 99; // fix all commander level to 99
	this.weapon = { 'lv':12 };
	this.armor = { 'lv':12 };
	this.kit = { 'lv':12 };
	this.unitType = unitTypes[unit.jobTypeId];
	this.jobInfo = this.unitType.job5;
	this.allowItemTypes = this.jobInfo.itemType;
	this.attackRole = _getUnitAttackRole(this.allowItemTypes[0]); // main attack type
	this.hpPct = 100;
	this.mpPct = 100;
	this.tileId = 0; // current tile id for this unit
	this.isFlameTile = false;
	this.attackType = 0;
	this.isDoubleAttack = false;
	this.isCriticalAttack = false;
	this.isDoubleTactic = false;
	this.isCriticalTactic = false;
	
	this.setHp = function(val) {
		this.hp = val;
		this.hpPct = val * 100 / this.hpMax;
		this.recalculateStatFromBattlePassive(); // might activate some battle passive
	};
	
	this.setMp = function(val) {
		this.mp = val;
		this.mpPct = this.mpMax ? (val * 100 / this.mpMax) : 0;
		this.recalculateStatFromBattlePassive();
	};
	
	this.initializeData = function(hp=0, mp=0) {
		this.calcuateAttrs();
		collectUnitPassives(this);
		calculateStatBasic(this);
		calculateStatFromBattlePassives(this);
		calcuateStatFromConditions(this);
		if (hp) {
			this.hp = hp;
			this.hpPct = hp * 100 / this.hpMax;
		}
		if (mp) {
			this.mp = mp;
			this.mpPct = this.mpMax ? (mp * 100 / this.mpMax) : 0;
		}
	};
	
	this.maxScroll = 100 + ((unit['cost'] - 4) * 5);
	if (this.attackRole === "Magic")
		this.scrolls = { 'str': 0, 'int': this.maxScroll, 'cmd': this.maxScroll, 'dex': 0, 'lck': this.maxScroll };
	else
		this.scrolls = { 'str': this.maxScroll, 'int': 0, 'cmd': this.maxScroll, 'dex': this.maxScroll, 'lck': 0 };
	
	this.calcuateAttrs = function() {
		this.attrs = { 'str': unit['str'] + this.scrolls['str'],
			'int': unit['int'] + this.scrolls['int'], 'cmd': unit['cmd'] + this.scrolls['cmd'],
			'dex': unit['dex'] + this.scrolls['dex'], 'lck': unit['lck'] + this.scrolls['lck']
		};
	};
	this.calcuateAttrs();
	
	this.getTotalScroll = function() {
		return this.scrolls['str'] + this.scrolls['int'] + this.scrolls['cmd'] + this.scrolls['dex'] + this.scrolls['lck'];
	};
	this.getMaxScrollType = function(attrName) {
		return Math.min(this.maxScroll, 500 - this.getTotalScroll() + this.scrolls[attrName]);
	};
	this.setScrollType = function(attrName, val) {
		this.scrolls[attrName] = val;
		this.calcuateAttrs();
		this.calculateStat();
	};
	
	this.getStat = function(statName) {
		return Math.min(2200, this.stat[statName]);
	};
	
	this.getPassiveTotalVal = function(passiveId, defaultVal=0) {
		return this.spActions.getPassiveTotalVal(passiveId, defaultVal);
	};
	
	this.hasPassive = function(passiveId) {
		return this.spActions.hasPassive(passiveId);
	};
	
	this.setArtifact = function(slotNo, item) {
		var slotInfo = this[slotNames[slotNo]];
		// if item tier is not changed, no need to find new enhance info
		if (slotInfo.item.tier !== item.tier) {
			slotInfo.enhance = findItemEnhance(item.tier, _findArtifactEnhanceType(item)[0], slotInfo.lv);
			// verify +6/+12 passive if current passive might not able to get
			if (slotInfo.p6 !== null && slotInfo.p6.itemTier > item.tier)
				slotInfo.p6 = null;
			if (slotInfo.p12 !== null && slotInfo.p12.itemTier > item.tier)
				slotInfo.p12 = null;
		}
		slotInfo.item = item;
		this.calculateStat();
	};
	
	this.setArtifactLevel = function(slotNo, lv) {
		// assume level is changed
		var slotInfo = this[slotNames[slotNo]];
		var item = slotInfo.item;
		slotInfo.lv = lv;
		slotInfo.enhance = findItemEnhance(item.tier, _findArtifactEnhanceType(item)[0], lv);
		// Note: no need to check +6/+12 passive because the old is kept but never be used in calculation
		this.calculateStat();
	};
	
	this.setArtifactUpgradePassive = function(slotNo, passiveLv, passive) {
		var slotInfo = this[slotNames[slotNo]];
		slotInfo['p'+passiveLv] = passive;
		this.calculateStat();
	};
	
	this.setCommanderPassive = function(slotIdx, passiveIdx) {
		this.selectedPassiveLists[slotIdx] = passiveIdx;
		this.calculateStat();
	};
	
	this.setRelicSet = function(relicSet) {
		for (var i = 0; i < relicSet.relicIds.length; i++)
			this.relics[i] = relics[relicSet.relicIds[i]];
		this.relicSet = relicSet;
		this.calculateStat();
	};
	
	this.setRelic = function(slotIdx, relic) {
		this.relics[slotIdx] = relic;
		this.relicSet = _findRelicSet(this.relics);
		this.calculateStat();
	};
	
	this.setRelicPassive = function(slotIdx, relicPassive) {
		this.relicPassives[slotIdx] = relicPassive;
		this.calculateStat();
	};
	
	this.setRelicPassiveLv = function(slotIdx, lv) {
		this.relicPassivesLv[slotIdx] = lv;
		this.calculateStat();
	};
	
	this.calculateStat = function() {
		collectUnitPassives(this);
		calculateStatBasic(this);
		calculateStatFromBattlePassives(this);
		calcuateStatFromConditions(this);
		if (onUserUnitInfoChangedCb !== null)
			onUserUnitInfoChangedCb(this, true, true, true, false);
	};
	
	this.recalculateStatFromBattlePassive = function() {
		calculateStatFromBattlePassives(this);
		calcuateStatFromConditions(this);
		if (onUserUnitInfoChangedCb !== null)
			onUserUnitInfoChangedCb(this, false, true, true, false);
	};
	
	this.recalculateStatFromCondition = function() {
		calcuateStatFromConditions(this);
		if (onUserUnitInfoChangedCb !== null)
			onUserUnitInfoChangedCb(this, false, false, true, false);
	};
	
	this.setFormationId = function(formationId) {
		this.formationId = formationId;
		collectUnitPassives(this);
		// no need to calculate stat because formation passives change only damage
		if (onUserUnitInfoChangedCb !== null)
			onUserUnitInfoChangedCb(this, false, false, false, true);
	};
	
	this.setFormationPos = function(formationPos) {
		this.formationPos = formationPos;
		collectUnitPassives(this);
		// no need to calculate stat because formation passives change only damage
		if (onUserUnitInfoChangedCb !== null)
			onUserUnitInfoChangedCb(this, false, false, false, true);
	};
	
	this.setTileId = function(tileId) {
		if (tileId >= 4201000) {
			this.tileId = tileId - 1000;
			this.isFlameTile = true;
		}
		else {
			this.tileId = tileId;
			this.isFlameTile = false;
		}
		this.calculateStat();
	};
	
	this.getTerrainAdvantage = function() {
		var val = this.unitType['tiles'][this.tileId][0];
		if (this.isFlameTile)
			val -= 10;
		if (val < 100 && this.hasPassive(2200037)) // Terrain Effect +
			val = 100;
		// cavalry with heavy armor research (Enhance Horsemanship research)
		if (isTypeHeavyCavalry(this.unit['jobTypeId']))
			val += 5
		
		// 253: (Formation Effect) Rough Terrain Boost (no in game)
		
		if (this.hasPassive(2200036)) // Naval Battle+
			val = Math.max(_getPassiveTerrainAdv(2200036, this.tileId, this.isFlameTile), val);
		// 161: Water Walking (noone has. same as 036)
		// 453: Mountain Battle Boost (noone has. same as 454)
		if (this.hasPassive(2200454)) // Mountain Battle Specialization
			val = Math.max(_getPassiveTerrainAdv(2200454, this.tileId, this.isFlameTile), val);
		if (this.hasPassive(2200591)) // Naval Battle Specialization
			val = Math.max(_getPassiveTerrainAdv(2200591, this.tileId, this.isFlameTile), val);
		return val;
	};
	
	this.setTacticInternal = function(tactic) {
		this.tactic = tactic;
		if (!this.canCriticalTactic())
			this.isCriticalTactic = false;
		else if (this.alwaysCriticalAttack())
			this.isCriticalTactic = true;
		if (!this.canDoubleTactic())
			this.isDoubleTactic = false;
	};
	
	this.setTactic = function(tactic) {
		this.setTacticInternal(tactic);
		if (onUserUnitInfoChangedCb !== null)
			onUserUnitInfoChangedCb(this, false, false, false, false);
	};
	
	this.canDoubleTactic = function() {
		if (this.hasPassive(2200573) || this.hasPassive(2200574) || this.hasPassive(2200575) || this.hasPassive(2200576))
			return false;
		return true;
	};
	
	this.canDoubleAttack = function() {
		if (this.hasPassive(2200418) || this.hasPassive(2200585)) // deadly and zhao spear
			return false;
		return true;
	};
	
	this.canCriticalTactic = function() {
		return this.tactic.canStreakCast;
	};
	
	this.alwaysCriticalAttack = function() {
		return this.hasPassive(2200061);
	};
	
	this.isAoEAttack = function() {
		return this.jobInfo.effectArea !== 0 || this.hasPassive(2200005);
	};
	
	this.battlePassives = [
		new BattleSp007(),  // unstoppable
		new BattleSp008(),  // union
		new BattleSp583(),  // God of War Guan Yu
		new BattleSp535(),  // swift cavalry passive
		new BattleSp440(),  // Quantify
		new BattleSp433(),  // MRL Surge
		new BattleSp011(),  // gfe
		new BattleSp040(),  // veteran
		// 106: Enemy stat Reduction (noone has)
		new BattleSp006(),  // rage %
		new BattleSp584(),  // Overwhelming Strength (zhang fei)
		new BattleSp038(),  // second wind
		new BattleSp537(),  // Hero of the Ages
		// 470: God of war (noone has)
		new BattleSp039(),  // Peerless %
		new BattleSp160(),  // elusive
		new BattleSp419(),  // Mental Exhaustion
		// 455: Rage (only Awaken Azure Dragon has this passive. no implement)
		// 475: Guerrilla War (noone has)
		new BattleSp442(),  // give and take
		new BattleSp589(),  // Little Conquerer (sun ce)
		new BattleSp593(),  // Solitary Ride (taishi ci)
		new BattleSp596(),  // Charge Fortification % (heavy cav, move count part)
	];
	
	this.conditions = [
		new ConditionAtk(),
		new ConditionWis(),
		new ConditionDef(),
		new ConditionAgi(),
		new ConditionMrl(),
		new ConditionBlindness(),
		new ConditionDeadlyPoison(),
		new ConditionBurn(),
		new ConditionBleeding(),
		new ConditionElectricShock(),
	];
	
	this.attackAccActionList = new AttackAccActionList(this);
	this.attackDmgActionList = new AttackDmgActionList(this);
	this.tacticAccActionList = new TacticAccActionList(this);
	this.tacticDmgActionList = new TacticDmgActionList(this);
	
	this.calculateAttackDmg = function(defInfo) {
		this.attackAccActionList.setDefInfo(defInfo);
		this.attackDmgActionList.setDefInfo(defInfo);
		this.tacticAccActionList.setDefInfo(defInfo);
		this.tacticDmgActionList.setDefInfo(defInfo);
	};
}

// type:
// - 0: normal (show if commander has)
// - 1: same as 0 but user can input the number (rage%, ...)
// - 2: always choosable (union, God of War Guan Yu)
function BattleSpAction(id, type, userVal=null, userType='int') {
	this.id = id;
	this.type = type;
	this.defaultVal = userVal;
	this.userVal = userVal;
	this.userValType = userType; // now only 'int' and 'bool'
	this.userValMin = 0;
	this.userValMax = (userType === 'int') ? 8 : 1;
	this.modPct = 0;

	this.clearStat = function() {
		this.atk = this.wis = this.def = this.agi = this.mrl = 0;
	};
	
	this.clearStat();
	
	this.caculateStatFloor = function(baseStat, pct) {
		this.atk = Math.floor(baseStat.atk * pct / 100);
		this.wis = Math.floor(baseStat.wis * pct / 100);
		this.def = Math.floor(baseStat.def * pct / 100);
		this.agi = Math.floor(baseStat.agi * pct / 100);
		this.mrl = Math.floor(baseStat.mrl * pct / 100);
	};
	
	this.getPassive = function() {
		return passives[this.id];
	};
	
	this.isActivated = function() {
		return this.atk !== 0 || this.wis !== 0 || this.def !== 0 || this.agi !== 0 || this.mrl !== 0;
	};
}

function BattleSp007() { // unstoppable
	BattleSpAction.call(this, 2200007, 1, 1, 'bool');
	this.userText = 'Activated';
	this.calculate = function(uinfo) {
		this.modPct = (this.userVal) ? 10 : 0;
		this.caculateStatFloor(uinfo.statBasic, this.modPct);
	};
}

function BattleSp008() { // union
	BattleSpAction.call(this, 2200008, 2, 0);
	this.userValMin = -7;
	this.userText = 'Number of ally';
	this.calculate = function(uinfo) {
		this.modPct = this.userVal * 3;
		this.caculateStatFloor(uinfo.statBasic, this.modPct);
	};
}

function BattleSp583() { // God of War Guan Yu
	BattleSpAction.call(this, 2200583, 2, 0, 'bool');
	this.userText = 'Near enemy Guan Yu';
	this.calculate = function(uinfo) {
		// because enemy guan yu might not exist for simulation. this passive val must be hard code
		this.modPct = this.userVal ? -10 : 0;
		//this.caculateStatFloor(uinfo.statBasic, this.modPct); // TODO: check again
		this.atk = Math.ceil(uinfo.statBasic.atk * this.modPct / 100);
		this.wis = Math.ceil(uinfo.statBasic.wis * this.modPct / 100);
		this.def = Math.ceil(uinfo.statBasic.def * this.modPct / 100);
		this.agi = Math.ceil(uinfo.statBasic.agi * this.modPct / 100);
		this.mrl = Math.ceil(uinfo.statBasic.mrl * this.modPct / 100);
	};
}

function BattleSp535() { // Match for a Hundred Strong (swift cavalry passive)
	BattleSpAction.call(this, 2200535, 1, 1);
	this.userText = 'Number of enemy in reach';
	this.calculate = function(uinfo) {
		this.modPct = this.userVal * uinfo.getPassiveTotalVal(this.id);
		this.atk = monoMathRound(uinfo.statBasic.atk * this.modPct / 100);
	};
}

function BattleSp440() { // Quantify (han xin passive)
	BattleSpAction.call(this, 2200440, 1, 0);
	this.userText = 'Number of ally in reach';
	this.calculate = function(uinfo) {
		this.modPct = this.userVal * uinfo.getPassiveTotalVal(this.id);
		this.caculateStatFloor(uinfo.statBasic, this.modPct);
	};
}

function BattleSp433() { // MRL Surge (Emperor passive)
	BattleSpAction.call(this, 2200433, 1, 0);
	this.userText = 'Number of ally in reach';
	this.calculate = function(uinfo) {
		this.modPct = this.userVal * uinfo.getPassiveTotalVal(this.id);
		this.mrl = Math.floor(uinfo.statBasic.mrl * this.modPct / 100);
	};
}

function BattleSp011() { // Good from Evil
	BattleSpAction.call(this, 2200011, 0);
	this.calculate = function(uinfo) {
		// TODO: game mode. now there is no mode that started from 100
		var val = Math.max(50 - Math.floor(uinfo['hpPct']), 0);
		this.modPct = Math.min(val * 100 / (50 * 2), 48);
		this.caculateStatFloor(uinfo.statBasic, this.modPct);
	};
}

function BattleSp040() { // Veteran
	BattleSpAction.call(this, 2200040, 0);
	this.calculate = function(uinfo) {
		this.modPct = this.atk = this.def = 0;
		if (uinfo['hpPct'] < 35) {
			this.modPct = uinfo.getPassiveTotalVal(2200040);
			this.atk = Math.floor(uinfo.statBasic.atk * this.modPct / 100);
			this.def = Math.floor(uinfo.statBasic.def * this.modPct / 100);
		}
	};
}

function BattleSp006() { // Rage +%
	BattleSpAction.call(this, 2200006, 1, 0);
	this.userValMax = 20;
	this.userText = 'Number of physical attack taken';
	this.calculate = function(uinfo) {
		this.modPct = this.userVal * uinfo.getPassiveTotalVal(this.id);
		this.atk = Math.floor(uinfo.statBasic.atk * this.modPct / 100);
	};
}

function BattleSp584() { // Overwhelming Strength (zhang fei)
	BattleSpAction.call(this, 2200584, 1, 0);
	this.userValMax = 20;
	this.userText = 'Number of attacks';
	this.calculate = function(uinfo) {
		this.modPct = this.userVal * uinfo.getPassiveTotalVal(this.id);
		this.atk = monoMathRound(uinfo.statBasic.atk * this.modPct / 100);
	};
}

function BattleSp038() { // Second Wind %
	BattleSpAction.call(this, 2200038, 0);
	this.calculate = function(uinfo) {
		this.modPct = this.atk = 0;
		if (uinfo['hpPct'] <= uinfo.getPassiveTotalVal(this.id)) {
			this.modPct = 60;
			this.atk = monoMathRound(uinfo.statBasic.atk * 0.6); // 60% is hard code
		}
	};
}

function BattleSp537() { // Hero of the Ages
	BattleSpAction.call(this, 2200537, 0);
	this.calculate = function(uinfo) {
		this.modPct = this.atk = 0;
		if (uinfo['hpPct'] <= uinfo.getPassiveTotalVal(this.id)) {
			this.modPct = 100;
			this.atk = uinfo.statBasic.atk;
		}
	};
}

function BattleSp039() { // Peerless %
	BattleSpAction.call(this, 2200039, 0);
	this.calculate = function(uinfo) {
		this.modPct = this.wis = 0;
		if (uinfo['mpPct'] <= uinfo.getPassiveTotalVal(this.id)) {
			this.modPct = 100;
			this.wis = uinfo.statBasic.wis;
		}
	};
}

function BattleSp160() { // Elusive
	BattleSpAction.call(this, 2200160, 1, 1, 'bool');
	this.userText = 'Your turn';
	this.calculate = function(uinfo) {
		this.atk = this.def = this.wis = 0;
		this.modPct = uinfo.getPassiveTotalVal(this.id);
		if (this.userVal) { // ally turn
			if (isAlmightyJob(uinfo.unit['jobTypeId'])) {
				this.atk = Math.floor(uinfo.statBasic.atk * this.modPct / 100);
				this.wis = Math.floor(uinfo.statBasic.wis * this.modPct / 100);
			}
			else if (uinfo.attackRole === 'Magic') {
				this.wis = Math.floor(uinfo.statBasic.wis * this.modPct / 100);
			}
			else {
				this.atk = Math.floor(uinfo.statBasic.atk * this.modPct / 100);
			}
		}
		else {
			this.def = Math.floor(uinfo.statBasic.def * this.modPct / 100);
		}
	};
}

function BattleSp419() { // Mental Exhaustion
	BattleSpAction.call(this, 2200419, 0);
	this.calculate = function(uinfo) {
		this.modPct = uinfo.getPassiveTotalVal(this.id);
		this.wis = monoMathRound(uinfo.statBasic.wis * this.modPct / 100);
		if (uinfo['mp'] === 0) {
			this.modPct = -this.modPct;
			this.wis = -this.wis;
		}
	};
}

function BattleSp442() { // Give and Take (xiang yu passive)
	BattleSpAction.call(this, 2200442, 1, 0, 'bool');
	this.userText = 'Got heal tactics';
	this.calculate = function(uinfo) {
		this.modPct = uinfo.getPassiveTotalVal(this.id);
		if (this.userVal)
			this.modPct = -this.modPct;
		this.atk = monoMathRound(uinfo.statBasic.atk * this.modPct / 100);
		this.wis = monoMathRound(uinfo.statBasic.wis * this.modPct / 100);
		this.def = monoMathRound(uinfo.statBasic.def * this.modPct / 100);
		this.agi = monoMathRound(uinfo.statBasic.agi * this.modPct / 100);
		this.mrl = monoMathRound(uinfo.statBasic.mrl * this.modPct / 100);
	};
}

function BattleSp589() { // Little Conquerer (sun ce)
	BattleSpAction.call(this, 2200589, 1, 5);
	this.userText = 'Number of enemies';
	this.userValMax = 5;
	this.calculate = function(uinfo) {
		this.modPct = this.userVal * uinfo.getPassiveTotalVal(this.id);
		this.atk = monoMathRound(uinfo.statBasic.atk * this.modPct / 100);
		this.def = monoMathRound(uinfo.statBasic.def * this.modPct / 100);
	};
}

function BattleSp593() { // Solitary Ride (taishi ci)
	BattleSpAction.call(this, 2200593, 1, 5);
	this.userText = 'Number of enemies';
	this.userValMax = 5;
	this.calculate = function(uinfo) {
		this.modPct = this.userVal * uinfo.getPassiveTotalVal(this.id);
		this.def = monoMathRound(uinfo.statBasic.def * this.modPct / 100);
	};
}

function BattleSp596() { // Charge Fortification % (heavy cav, move count part)
	BattleSpAction.call(this, 2200596, 1, 0);
	this.userValMax = 13;
	this.userText = 'Number of moved';
	this.calculate = function(uinfo) {
		this.modPct = this.userVal * 2; // Note: 2% is hard code
		this.def = monoMathRound(uinfo.statBasic.def * this.modPct / 100);
	};
}

function ConditionBase(allowIds) {
	this.allowIds = allowIds;
	this.userIdx = -1; // none
	
	// below function is for stat buff/debuff. for condition, need to be overriden
	this.calculate = function(uinfo, buffPct, debuffPct) {
		if (this.userIdx === 0) // stat+
			buffPct[this.type] *= 0.8;
		else if (this.userIdx === 1) // stat+ 2
			buffPct[this.type] *= 0.7;
		else if (this.userIdx === 2) // stat-
			debuffPct[this.type] *= 0.7;
		else if (this.userIdx === 3) // stat- 2
			debuffPct[this.type] *= 0.6;
	};
}

function ConditionAtk() {
	ConditionBase.call(this, [ 2100011, 2100028, 2100005, 2100022 ]);
	this.name = 'ATK';
	this.type = 'atk';
}

function ConditionWis() {
	ConditionBase.call(this, [ 2100013, 2100030, 2100007, 2100024 ]);
	this.name = 'WIS';
	this.type = 'wis';
}

function ConditionDef() {
	ConditionBase.call(this, [ 2100012, 2100029, 2100006, 2100023 ]);
	this.name = 'DEF';
	this.type = 'def';
}

function ConditionAgi() {
	ConditionBase.call(this, [ 2100014, 2100031, 2100008, 2100025 ]);
	this.name = 'AGI';
	this.type = 'agi';
}

function ConditionMrl() {
	ConditionBase.call(this, [ 2100015, 2100032, 2100009, 2100026 ]);
	this.name = 'MRL';
	this.type = 'mrl';
}

function ConditionBlindness() {
	ConditionBase.call(this, [ 2100035 ]);
	this.calculate = function(uinfo, buffPct, debuffPct) {
		if (isAlmightyJob(uinfo.unit['jobTypeId'])) {
			debuffPct['atk'] *= 0.9;
			debuffPct['wis'] *= 0.9;
		}
		else if (uinfo.attackRole === 'Magic') {
			debuffPct['wis'] *= 0.9;
		}
		else {
			debuffPct['atk'] *= 0.9;
		}
		debuffPct['def'] *= 0.9;
		debuffPct['agi'] *= 0.9;
		debuffPct['mrl'] *= 0.9;
	};
}

function ConditionDeadlyPoison() {
	ConditionBase.call(this, [ 2100034 ]);
	this.calculate = function(uinfo, buffPct, debuffPct) {
		debuffPct['agi'] *= 0.7;
	};
}

function ConditionBurn() {
	ConditionBase.call(this, [ 2100033 ]);
	this.calculate = function(uinfo, buffPct, debuffPct) {
		debuffPct['def'] *= 0.7;
	};
}

function ConditionBleeding() {
	ConditionBase.call(this, [ 2100038 ]);
	this.calculate = function(uinfo, buffPct, debuffPct) {
		debuffPct['atk'] *= 0.7;
	};
}

function ConditionElectricShock() {
	ConditionBase.call(this, [ 2100051 ]);
	this.calculate = function(uinfo, buffPct, debuffPct) {
		debuffPct['wis'] *= 0.8;
		debuffPct['def'] *= 0.8;
	};
}

function _addFormationPassive(uinfo, idx) {
	var formation = formations[uinfo.formationId];
	var passiveIds = formation.passives[idx];
	var passiveVal = formation.passiveVals[idx];
	if (idx >= 2)
		passiveVal += formation.lv90Val[idx - 2];
	passiveVal /= 100;
	var target = formation.target[idx];
	for (var i = 0; i < passiveIds.length; i++) {
		if (target === 1 && !isCavalryUnit(uinfo.unit.jobTypeId))
			continue; // for cavalry only
		if (target === 2 && isCavalryUnit(uinfo.unit.jobTypeId))
			continue; // except cavalry
		uinfo.spActions.addSpAction(passiveIds[i], passiveVal);
	}
}

// collect all unit passives
function collectUnitPassives(uinfo) {
	// Note: in game has data for disabling some passives when commander has specific passive such as 
	//       chain attack disables leading attack and double counter. no export this data to web. need to manual while using them.
	
	uinfo.spActions = new SpActionList(uinfo); // map passive id to parent passive info
	// weapon, armor, kit
	uinfo.spActions.addSpActionFromArtifact(uinfo.weapon);
	uinfo.spActions.addSpActionFromArtifact(uinfo.armor);
	uinfo.spActions.addSpActionFromArtifact(uinfo.kit);
	// job passives
	var utypePassives = uinfo.jobInfo["passives"];
	for (var i = 0; i < utypePassives.length; i++)
		uinfo.spActions.addSpAction(utypePassives[i][0], utypePassives[i][1]);
	
	// commander passives
	for (var i = 0; i < uinfo['selectedPassiveLists'].length; i++)
		uinfo.spActions.addSpActionFromPassiveList(uinfo.commanderPasiveLists[uinfo.selectedPassiveLists[i]]);
	
	// relics. need to sum same relic passive values (then floor) before adding to spaction
	var tmpRelicPassives = {};
	for (var i = 0; i < uinfo.relicPassives.length; i++) {
		var relicPassive = uinfo.relicPassives[i];
		var passiveId = relicPassive['passiveId'];
		if (!(passiveId in tmpRelicPassives))
			tmpRelicPassives[passiveId] = 0;
		tmpRelicPassives[passiveId] += _getRelicPassiveValue(relicPassive, uinfo['relicPassivesLv'][i], uinfo.attrs);
	}
	// should add even passive val is 0 or not?
	for (passiveId in tmpRelicPassives)
		uinfo.spActions.addSpAction(passiveId, Math.floor(tmpRelicPassives[passiveId]));
	if (uinfo.relicSet !== null)
		uinfo.spActions.addSpActionFromPassiveList(passiveLists[uinfo.relicSet.passiveListId]);
	
	// in anni, AI got 7%. start second got 3%
	var extraPct = gameMode[uinfo.id + 'bonus'];
	if (extraPct !== 0) {
		uinfo.spActions.addSpAction(2200108, extraPct);
		uinfo.spActions.addSpAction(2200110, extraPct);
		uinfo.spActions.addSpAction(2200112, extraPct);
		uinfo.spActions.addSpAction(2200114, extraPct);
		uinfo.spActions.addSpAction(2200116, extraPct);
	}
	
	if (gameMode.hasFormation) {
		// collect formation passives
		_addFormationPassive(uinfo, 0);
		_addFormationPassive(uinfo, 1);
		_addFormationPassive(uinfo, uinfo.formationPos+2);
	}
	
	// set tactic again after collected all passive to check double/critical
	uinfo.setTacticInternal(uinfo.tactic);
	if (uinfo.alwaysCriticalAttack())
		uinfo.isCriticalAttack = true;
	if (!uinfo.canDoubleAttack())
		uinfo.isDoubleAttack = false;
}

function calculateStatBasic(uinfo) {
	var unit = uinfo['unit'];
	var unitType = uinfo.unitType;
	
	uinfo.hpMax = unit['hp'] + uinfo.jobInfo['hpPlus'] * uinfo.lv;
	uinfo.mpMax = unit['mp'] + uinfo.jobInfo['mpPlus'] * uinfo.lv;
	var hpBoost = uinfo.getPassiveTotalVal(2200118); // HP Boost
	hpBoost += uinfo.getPassiveTotalVal(2200503); // Relic: HP Boost
	hpBoost += monoMathRound(uinfo['hpMax'] * uinfo.getPassiveTotalVal(2200119) / 100); // HP Boost %
	var mpBoost = uinfo.getPassiveTotalVal(2200120); // MP Boost
	mpBoost += uinfo.getPassiveTotalVal(2200504); // Relic: MP Boost
	mpBoost += monoMathRound(uinfo['hpMax'] * uinfo.getPassiveTotalVal(2200121) / 100); // MP Boost %
	for (var j = 0; j < uinfo['relics'].length; j++) {
		hpBoost += uinfo['relics'][j]['hp'];
		mpBoost += uinfo['relics'][j]['mp'];
	}
	uinfo.hpMax += hpBoost;
	uinfo.mpMax = Math.min(uinfo.mpMax + mpBoost, 500);
	uinfo.epMax = unit['ep'];
	if (uinfo.epMax !== 0)
		uinfo.mpMax = 0;
	uinfo.hpMax = Math.floor(uinfo.hpMax * gameMode.hpMul); // cap is 5000
	// keep hp/mp percentage
	uinfo.hp = Math.floor(uinfo.hpMax * uinfo.hpPct / 100);
	uinfo.mp = Math.floor(uinfo.mpMax * uinfo.mpPct / 100);
	uinfo.ep = uinfo.epMax;
	uinfo.hpPct = uinfo.hp * 100 / uinfo.hpMax;
	uinfo.mpPct = uinfo.mpMax ? (uinfo.mp * 100 / uinfo.mpMax) : 0;
	
	uinfo.statBasic = {}
	for (var i = 0; i < attrNames.length; i++) {
		var nscroll = uinfo['scrolls'][attrNames[i]];
		var val = unit[attrNames[i]] + Math.min(nscroll, 100);
		var constVal = 0.0;
		if (val > 110)
			constVal = 5.0;
		else if (val > 90)
			constVal = (val - 90) / 40 + 4.5;
		else if (val > 70)
			constVal = (val - 70) / 20 + 3.5;
		else if (val > 50)
			constVal = (val - 50) / 10 + 1.5;
		else
			constVal = val / 100 + 1.0;
		
		var statName = statNames[i];
		var tmpVal = (val / 2) + ((unitType[statName+'Lv'] + constVal) * uinfo.lv / 2);
		var result = monoMathRound(tmpVal);
		if (nscroll > 100)
			result += nscroll - 100;
		uinfo.statBasic[statName] = result + unitType['rank12Stats'][statName];
	}
	
	// Note: skip applying "Add*Pct" value from battle event script (no these values in Anni/PvP)
	
	// general equipments, artifacts and relics
	for (var i = 0; i < statNames.length; i++) {
		var statName = statNames[i];
		uinfo.statBasic[statName] += unitType['lv99geStats'][statName];

		uinfo.statBasic[statName] += uinfo['weapon']['item'][statName];
		if (uinfo['weapon']['enhance'])
			uinfo.statBasic[statName] += uinfo['weapon']['enhance'][statName];
		uinfo.statBasic[statName] += uinfo['armor']['item'][statName];
		if (uinfo['armor']['enhance'])
			uinfo.statBasic[statName] += uinfo['armor']['enhance'][statName];
		uinfo.statBasic[statName] += uinfo['kit']['item'][statName];
		if (uinfo['kit']['enhance'])
			uinfo.statBasic[statName] += uinfo['kit']['enhance'][statName];
		
		for (var j = 0; j < uinfo['relics'].length; j++)
			uinfo.statBasic[statName] += uinfo['relics'][j][statName];
	}
	
	// passive stat boost
	uinfo.statBasic['atk'] += monoMathRound(uinfo.statBasic['atk'] * uinfo.getPassiveTotalVal(2200108) / 100);
	uinfo.statBasic['atk'] += uinfo.getPassiveTotalVal(2200107);
	uinfo.statBasic['wis'] += monoMathRound(uinfo.statBasic['wis'] * uinfo.getPassiveTotalVal(2200110) / 100);
	uinfo.statBasic['wis'] += uinfo.getPassiveTotalVal(2200109);
	var baseDef = uinfo.statBasic['def'];
	uinfo.statBasic['def'] += monoMathRound(baseDef * uinfo.getPassiveTotalVal(2200112) / 100);
	uinfo.statBasic['def'] += uinfo.getPassiveTotalVal(2200111);
	uinfo.statBasic['def'] += monoMathRound(baseDef * uinfo.getPassiveTotalVal(2200596) / 100); // Charge fortification %
	uinfo.statBasic['agi'] += monoMathRound(uinfo.statBasic['agi'] * uinfo.getPassiveTotalVal(2200114) / 100);
	uinfo.statBasic['agi'] += uinfo.getPassiveTotalVal(2200113);
	uinfo.statBasic['mrl'] += monoMathRound(uinfo.statBasic['mrl'] * uinfo.getPassiveTotalVal(2200116) / 100);
	uinfo.statBasic['mrl'] += uinfo.getPassiveTotalVal(2200115);
}

function calculateStatFromBattlePassives(uinfo) {
	var result = { 'atk':0, 'wis':0, 'def':0, 'agi':0, 'mrl':0 };
	
	for (var i = 0; i < uinfo.battlePassives.length; i++) {
		var battlePassive = uinfo.battlePassives[i];
		if (battlePassive.type === 2 || uinfo.hasPassive(battlePassive.id)) {
			battlePassive.calculate(uinfo);
			result.atk += battlePassive.atk;
			result.wis += battlePassive.wis;
			result.def += battlePassive.def;
			result.agi += battlePassive.agi;
			result.mrl += battlePassive.mrl;
		}
	}
	
	uinfo.statBattle = {
		'atk': uinfo.statBasic.atk + result.atk,
		'wis': uinfo.statBasic.wis + result.wis,
		'def': uinfo.statBasic.def + result.def,
		'agi': uinfo.statBasic.agi + result.agi,
		'mrl': uinfo.statBasic.mrl + result.mrl,
	};	
}

function calcuateStatFromConditions(uinfo) {
	// below 2 keep invert percentage
	var buffPct = { 'atk':1, 'wis':1, 'def':1, 'agi':1, 'mrl':1 };
	var debuffPct = { 'atk':1, 'wis':1, 'def':1, 'agi':1, 'mrl':1 };
	
	for (var i = 0; i < uinfo.conditions.length; i++) {
		var ucond = uinfo.conditions[i];
		if (ucond.userIdx !== -1)
			ucond.calculate(uinfo, buffPct, debuffPct);
	}
	
	// 463: Status Effect + (noone has)

	uinfo.buffPct = buffPct;
	uinfo.debuffPct = debuffPct;
	uinfo.buffVal = {};
	uinfo.debuffVal = {};
	
	uinfo.statCond = {};
	for (var i = 0; i < statNames.length; i++) {
		var statName = statNames[i];
		var baseVal = uinfo.statBattle[statName];
		uinfo.buffVal[statName] = uinfo.debuffVal[statName] = 0;
		if (buffPct[statName] != 1)
			uinfo.buffVal[statName] = monoMathRound(baseVal * (1 - buffPct[statName]));
		if (debuffPct[statName] != 1)
			uinfo.debuffVal[statName] = monoMathRound(baseVal * (1 - debuffPct[statName]));
		uinfo.statCond[statName] = baseVal + uinfo.buffVal[statName] - uinfo.debuffVal[statName];
	}
	
	uinfo.stat = uinfo.statCond;
}

function calculateCriticalRate(atkInfo, defInfo) {
	if (atkInfo.hasPassive(2200061)) // Critical Attack
		return 100;
	var atkVal = atkInfo.getStat('mrl');
	var defVal = defInfo.getStat('mrl');
	if (atkVal >= defVal * 3)
		return 50;
	else if (atkVal >= defVal * 2)
		return 10 + (atkVal - defVal * 2) * 40 / defVal;
	else if (atkVal >= defVal)
		return 1 + (atkVal - defVal) * 9 / defVal;
	return 1;
}

function getAttackBasicAcc(atkInfo, defInfo) {
	var atkAgi = atkInfo.getStat('agi');
	var defAgi = defInfo.getStat('agi');
	var atkVal = atkAgi + atkInfo.attrs.lck / 5;
	var defVal = defAgi + defInfo.attrs.lck / 5;
	if (atkAgi >= defAgi * 2)
		return 95;
	else if (atkAgi >= defAgi)
		return 85 + (atkVal - defVal) * 10 / defVal;
	else if (atkAgi >= defAgi / 2)
		return 55 + (atkVal - defVal/2) * 30 / (defVal/2);
	return 40 + Math.max(-5, (atkVal - defVal/3) * 30 / (defVal/3));
}

function getAttackDoubleRate(atkInfo, defInfo) {
	if (!atkInfo.canDoubleAttack())
		return 0;
	if (atkInfo.hasPassive(2200023)) // only chain attack (leading and double counter need attack type)
		return 100;
	var atkAgi = atkInfo.getStat('agi');
	var defAgi = defInfo.getStat('agi');
	var atkVal = atkAgi + atkInfo.attrs.lck / 5;
	var defVal = defAgi + defInfo.attrs.lck / 5;
	if (atkAgi >= defAgi * 3)
		return 90;
	else if (atkAgi >= defAgi * 2)
		return 10 + (atkVal - defVal * 2) * 80 / defVal;
	else if (atkAgi >= defAgi)
		return 1 + (atkVal - defVal) * 10 / (defVal);
	return 1;
}

function getTacticBasicAcc(atkInfo, defInfo) {
	var atkWis = atkInfo.getStat('wis') + atkInfo.getStat('mrl');
	var defWis = defInfo.getStat('wis') + defInfo.getStat('mrl');
	var atkVal = atkWis + atkInfo.attrs.lck / 5;
	var defVal = defWis + defInfo.attrs.lck / 5;
	if (atkWis >= atkWis * 2)
		return 90;
	else if (atkWis >= atkWis)
		return 80 + (atkVal - defVal) * 10 / defVal;
	else if (atkWis >= atkWis / 2)
		return 50 + (atkVal - defVal/2) * 30 / (defVal/2);
	return 35 + (atkVal - defVal/3) * 30 / (defVal/3);
}

function getTacticDoubleRate(atkInfo, defInfo) {
	if (!atkInfo.canDoubleTactic())
		return 0;
	if (atkInfo.hasPassive(2200024)) // double tactics
		return 100;
	var atkWis = atkInfo.getStat('wis') + atkInfo.getStat('mrl');
	var defWis = defInfo.getStat('wis') + defInfo.getStat('mrl');
	var atkVal = atkWis + atkInfo.attrs.lck / 5;
	var defVal = defWis + defInfo.attrs.lck / 5;
	if (atkWis >= defWis * 3)
		return 90;
	else if (atkWis >= defWis * 2)
		return 10 + (atkVal - defVal * 2) * 80 / defVal;
	else if (atkWis >= defWis)
		return 1 + (atkVal - defVal) * 10 / defVal;
	return 1;
}

function _getAtkVal(atkInfo, mainStat, subStat) {
	var atkVal = atkInfo.getStat(mainStat);
	if (atkInfo.hasPassive(2200104)) { // atk stat switch
		var subVal = atkInfo.getStat(subStat);
		if (subVal > atkVal)
			atkVal = subVal;
	}
	return atkVal;
}

function _getDefVal(defInfo, mainStat, subStat) {
	var defVal = defInfo.getStat(mainStat);
	if (defInfo.hasPassive(2200105)) { // def stat switch
		var subVal = defInfo.getStat(subStat);
		defVal = monoMathRound((defVal + subVal) * defInfo.getPassiveTotalVal(2200105) / 100);
		//var subVal = defInfo.getStat(subStat);
		//if (subVal > defVal)
		//	defVal = subVal;
	}
	return defVal;
}

function getAttackBasicDmg(atkInfo, defInfo) {
	var atkAtk = _getAtkVal(atkInfo, 'atk', 'wis');
	var defDef = _getDefVal(defInfo, 'def', 'wis');
	
	atkAtk = monoMathRound(atkAtk * atkInfo.getTerrainAdvantage() / 100);
	defDef = monoMathRound(defDef * defInfo.getTerrainAdvantage() / 100);
	atkAtk += getResearchAtkBonus(atkInfo.allowItemTypes[0]);
	// TODO: now allowed game modes are same calculation (need when implemening 4gods or other modes)
	var dmg = Math.max(1, (atkInfo.lv + 30) + (atkAtk - defDef) * (5000 / 10000)); // min dmg is 1
	return dmg;
}

function _getTacticMagicBasicDmg(atkInfo, defInfo) {
	var atkWis = _getAtkVal(atkInfo, 'wis', 'atk');
	var defWis = _getDefVal(defInfo, 'wis', 'def');
	
	if (atkInfo.tactic.damageType === 'Fixed') // crimson lotus
		defWis = 0;
	
	atkWis = monoMathRound(atkWis * atkInfo.getTerrainAdvantage() / 100);
	defWis = monoMathRound(defWis * defInfo.getTerrainAdvantage() / 100);
	return (atkInfo.lv + 25) + (atkWis - defWis) * (3333 / 10000);
}

function _getTacticPhysicalBasicDmg(atkInfo, defInfo) {
	var atkAtk = _getAtkVal(atkInfo, 'atk', 'wis');
	var defDef = _getDefVal(defInfo, 'def', 'wis');
	
	atkAtk = monoMathRound(atkAtk * atkInfo.getTerrainAdvantage() / 100);
	defDef = monoMathRound(defDef * defInfo.getTerrainAdvantage() / 100);
	atkAtk += getResearchAtkBonus(atkInfo.allowItemTypes[0]);
	// TODO: now allowed game modes are same calculation (need when implemening 4gods or other modes)
	var dmg = Math.max(1, (atkInfo.lv + 30) + (atkAtk - defDef) * (5000 / 10000)); // min dmg is 1
	// Noone has Ignore Type Advantage (401)
	return dmg;
}

SIDE_ATK = 0
SIDE_DEF = 1
// side: 0=atk, 1=def
// type:
// - 0: normal (show if commander has a passive)
// - 1: same as 0 but user can input the number or boolean (Narrow Escape, Overwhelm, Surprise Attack)
// - 2: always choosable if special conditions are met (Command: Attack DEF Rate Pierce, Emperor tactic)
// for tech and special actions, 1 and 2 are same (should use 2)
function AttackAccActionBase(actList, id, side, type, userVal=null, userType='int') {
	// action can be passives, research, special calculation
	this.actList = actList; // root of all action (contain atkInfo and defInfo)
	this.id = id; // less than 100 for special
	this.passiveId = this.techId = 0;
	if (id > 2500000) // research
		this.techId = id;
	else if (id > 2200000)
		this.passiveId = id;
	this.hasMainPassive = true;
	this.hasSubPassive = false;
	this.subPassives = {}; // store sub passive activation state for removing and re-add passive
	this.side = side;
	this.type = type;
	this.userVal = userVal;
	this.userValType = userType; // now only 'int' and 'bool'
	this.userValMin = 0;
	this.userValMax = (userType === 'int') ? 8 : 1;
	this.modPct = 0;
	this.modVal = 0;
	
	this.getPassive = function() { return this.passiveId ? passives[this.passiveId] : null; };
	
	this.getAtkInfo = function() { return this.actList.atkInfo; };
	this.getDefInfo = function() { return this.actList.defInfo; };
	this.getActionUserInfo = function() {
		return (this.side === SIDE_ATK) ? this.actList.atkInfo : this.actList.defInfo;
	};
	this.getTactic = function () { return this.actList.atkInfo.tactic; };
	
	this.getPassiveTotalVal = function() {
		return this.getActionUserInfo().getPassiveTotalVal(this.passiveId);
	};
	
	this.setUserVal = function(userVal) {
		this.userVal = userVal;
	};
	
	// extra condition for each passive. by default, no extra check
	this.canApply = function() { return true; };
	
	this.needProcess = function() {
		if (this.type === 2)
			return this.canApply();
		if (this.passiveId !== 0)
			return (this.getActionUserInfo().hasPassive(this.passiveId) && this.canApply());
		if (this.techId !== 0)
			return this.canApply();
		if (this.id !== 0)
			return this.canApply();
		return true;
	};
	
	this.getPassiveGroup = function() {
		return this.getActionUserInfo().spActions.getPassiveGroup(this.passiveId);
	};
	
	this.setSubPassiveVal = function(spAction, val) {
		spAction.enabled = val;
		this.subPassives[spAction.id] = val;
	};
	
	this.handleTriggerablePassive = function() {
		if (this.passiveId === 0)
			return; // only passive action need to be handled
		var spActionArr = this.getPassiveGroup();
		if (spActionArr === null) { // no triggerable passive, skip
			this.hasMainPassive = true;
			this.hasSubPassive = false;
			return;
		}
		this.hasMainPassive = spActionArr[0].id === this.passiveId;
		this.hasSubPassive = true;
		for (var i = 0; i < spActionArr.length; i++) {
			var spaction = spActionArr[i];
			if (spaction.passive.triggerType === 0)
				continue;
			if (spaction.id in this.subPassives)
				spaction.enabled = this.subPassives[spaction.id];
			else
				this.subPassives[spaction.id] = spaction.enabled;
		}
	};
	
	this.getDisplayName = function() {
		if (this.passiveId !== 0)
			return toLocalize(passives[this.passiveId]['name']);
		if (this.techId !== 0)
			return toLocalize(research[this.techId]);
		return toLocalize(this.displayName);
	};
}

function AttackAccActionList(atkInfo) {
	this.atkInfo = atkInfo;
	
	// below are special passives (in order) to make acc be 0% or 100%. (not implement in simulator)
	// - 013: Physical Attack Immunity
	// - 016: Attack Certain Hit
	// - 019: Ranged Attack Immunity (deactivate when confused or xbox special)
	// - 017: Physical Certain Hit
	// - 444: Comeback
	this.actionArr = [
		new AttackAccSp028(this), // Attack ACC +
		new AttackAccSp443(this), // Overwhelm (xiang yu) (only main target)
		new AttackAccSp029(this), // ATK DEF Rate +
		new AttackAccSp508(this), // Relic: Melee Attack DEF Rate +
		new AttackAccSp509(this), // Relic: Ranged Attack DEF Rate +
		new AttackAccSp033(this), // All DEF Rate +
		new AttackAccSp036(this), // Naval Battle + (only water related, terrain in special terrain adv)
		new AttackAccSp208(this), // Narrow Escape (condition) (*0.5)
		new AttackAccSp447(this), // Command: Attack DEF Rate Pierce (Emperor tactic)
		new AttackAccSp413(this), // Surprise Attack
		new AttackAccSp414(this), // Smash
		// 539: Vermilion Bird: Counterattack EVA Boost % (noone has)
		new AttackAccSp416(this), // Attack DEF Rate Pierce
		new AttackAccSp505(this), // Relic: Melee Attack DEF Rate Pierce
		new AttackAccSp506(this), // Relic: Ranged Attack DEF Rate Pierce
		new AttackAccSp571(this), // Long-Range Archery (for extra range)
		new AttackAccTech006(this), // Research footman
		new AttackAccTech026(this), // Research dancer
		// 403: (Formation Effect) Attack DEF Rate +% (no use in game)
		new AttackAccSp405(this), // (Formation Effect) All DEF Rate +%
		new AttackAccSp406(this), // (Formation Effect) Attack ACC +%
		// 408: (Formation Effect) All ACC +% (no use in game)
	];
	
	this.setDefInfo = function(defInfo) {
		this.defInfo = defInfo;
		this.calculate();
	};
	
	this.calculate = function() {
		this.basicAcc = getAttackBasicAcc(this.atkInfo, this.defInfo);
		var acc = this.basicAcc;
		for (var i = 0; i < this.actionArr.length; i++) {
			var attackAcc = this.actionArr[i];
			if (attackAcc.needProcess()) {
				attackAcc.adjustValue(acc);
				acc = attackAcc.result;
			}
		}
		this.result = acc;
	};
}

function AttackAccSp028(actList) { // Attack ACC +
	AttackAccActionBase.call(this, actList, 2200028, SIDE_ATK, 0);
	
	this.adjustValue = function(acc) {
		this.modPct = this.getPassiveTotalVal();
		this.result = Math.min(acc + acc * this.modPct / 100, 100);
	};
}

function AttackAccSp443(actList) { // Overwhelm
	AttackAccActionBase.call(this, actList, 2200443, SIDE_ATK, 1, 1, 'bool');
	this._userText = 'Main Target';
	this.canApply = function() {
		// if not aoe, no need to ask
		if (this.getAtkInfo().isAoEAttack()) {
			this.userText = this._userText;
		}
		else {
			delete this.userText;
			this.userVal = 1;
		}
		return true;
	};
	
	this.adjustValue = function(acc) {
		if (this.userVal) {
			var val = (this.getAtkInfo().attrs.str - this.getDefInfo().attrs.str) / 2;
			this.modPct = mathClamp(val, 0, this.getPassiveTotalVal());
			this.result = Math.min(acc * (1 + this.modPct * 0.01), 100);
		} else {
			this.modPct = 0;
			this.result = acc;
		}
	};
}

function AttackAccSp029(actList) { // ATK DEF Rate +
	AttackAccActionBase.call(this, actList, 2200029, SIDE_DEF, 0);
	
	this.adjustValue = function(acc) {
		this.modPct = this.getPassiveTotalVal();
		this.result = Math.max(acc - acc * this.modPct / 100, 30);
	};
}

function AttackAccSp508(actList) { // Relic: Melee Attack DEF Rate +
	AttackAccActionBase.call(this, actList, 2200508, SIDE_DEF, 0);
	this.canApply = function() {
		return this.getAtkInfo().attackRole !== 'Range';
	};
	
	this.adjustValue = function(acc) {
		this.modPct = this.getPassiveTotalVal();
		this.result = mathClamp(acc - acc * this.modPct / 100, 30, 100);
	};
}

function AttackAccSp509(actList) { // Relic: Ranged Attack DEF Rate +
	AttackAccActionBase.call(this, actList, 2200509, SIDE_DEF, 0);
	this.canApply = function() {
		return this.getAtkInfo().attackRole === 'Range';
	};
	
	this.adjustValue = function(acc) {
		this.modPct = this.getPassiveTotalVal();
		this.result = mathClamp(acc - acc * this.modPct / 100, 30, 100);
	};
}

function AttackAccSp033(actList) { // All DEF Rate +
	AttackAccActionBase.call(this, actList, 2200033, SIDE_DEF, 0)
	
	this.adjustValue = function(acc) {
		this.modPct = this.getPassiveTotalVal();
		this.result = Math.max(acc - acc * this.modPct / 100, 30);
	};
}

function AttackAccSp036(actList) { // Naval Battle +
	AttackAccActionBase.call(this, actList, 2200036, SIDE_ATK, 0);
	this.canApply = function() {
		return (this.getAtkInfo().tileId in this.getPassive().tileAdvs);
	};
	
	this.adjustValue = function(acc) {
		this.modPct = this.getPassiveTotalVal();
		this.result = Math.min(acc + acc * this.modPct / 100, 100);
	};
}

function AttackAccSp208(actList) { // Narrow Escape
	AttackAccActionBase.call(this, actList, 2200208, SIDE_DEF, 1, 0, 'bool');
	this.userText = 'Activated';
	
	this.adjustValue = function(acc) {
		if (this.userVal) {
			this.modPct = 50;
			this.result = acc * 0.5;
		} else {
			this.modPct = 0;
			this.result = acc;
		}
	};
}

function AttackAccSp447(actList) { // Command: Attack DEF Rate Pierce
	AttackAccActionBase.call(this, actList, 2200447, SIDE_ATK, 2, 0, 'bool');
	this.userText = 'In Emperor Aura';
	
	this.adjustValue = function(acc) {
		if (this.userVal) {
			this.modPct = 7; // passive from Emperor tactic (fixed value here)
			this.result = Math.min(acc * (1 + this.modPct / 100), 100);
		} else {
			this.modPct = 0;
			this.result = acc;
		}
	};
}

function AttackAccSp413(actList) { // Surprise Attack
	AttackAccActionBase.call(this, actList, 2200413, SIDE_ATK, 1, 2, 'int');
	this.userText = 'Move Step';
	this.userValMax = '13';
	
	this.adjustValue = function(acc) {
		this.modPct = this.userVal * this.getPassiveTotalVal();
		this.result = mathClamp(acc * (1 + this.modPct / 100), 30, 100);
	};
}

function AttackAccSp414(actList) { // Smash
	AttackAccActionBase.call(this, actList, 2200414, SIDE_ATK, 1, 2);
	this.canApply = function() {
		return this.getAtkInfo().attackType > 1;
	};
	
	this.adjustValue = function(acc) {
		this.modPct = this.getPassiveTotalVal();
		this.result = mathClamp(acc * (1 + this.modPct / 100), 30, 100);
	};
}

function AttackAccSp416(actList) { // Attack DEF Rate Pierce
	AttackAccActionBase.call(this, actList, 2200416, SIDE_ATK, 0);
	
	this.adjustValue = function(acc) {
		this.modPct = this.getPassiveTotalVal();
		this.result = mathClamp(acc * (1 + this.modPct / 100), 30, 100);
	};
}

function AttackAccSp505(actList) { // Relic: Melee Attack DEF Rate Pierce
	AttackAccActionBase.call(this, actList, 2200505, SIDE_ATK, 0);
	this.canApply = function() {
		return this.getAtkInfo().attackRole !== 'Range';
	};
	
	this.adjustValue = function(acc) {
		this.modPct = this.getPassiveTotalVal();
		this.result = mathClamp(acc * (1 + this.modPct / 100), 30, 100);
	};
}

function AttackAccSp506(actList) { // Relic: Ranged Attack DEF Rate Pierce
	AttackAccActionBase.call(this, actList, 2200506, SIDE_ATK, 0);
	this.canApply = function() {
		return this.getAtkInfo().attackRole === 'Range';
	};
	
	this.adjustValue = function(acc) {
		this.modPct = this.getPassiveTotalVal();
		this.result = mathClamp(acc * (1 + this.modPct / 100), 30, 100);
	};
}

function AttackAccSp571(actList) { // Long-Range Archery
	AttackAccActionBase.call(this, actList, 2200571, SIDE_ATK, 1, 0, 'bool');
	this.userText = 'Extra Range';
	
	this.adjustValue = function(acc) {
		this.modPct = this.getPassiveTotalVal();
		this.result = Math.min(acc - acc * this.modPct / 100, 100);
	};
}

function AttackAccTech006(actList) { // Enhance Shields
	AttackAccActionBase.call(this, actList, 2500006, SIDE_DEF, 0);
	this.canApply = function() {
		return this.getDefInfo().unit.jobTypeId === 1210002;
	};
	
	this.adjustValue = function(acc) {
		this.modVal = 15;
		this.result = acc - this.modVal;
	};
}

function AttackAccTech026(actList) { // Dancer Routine
	AttackAccActionBase.call(this, actList, 2500026, SIDE_DEF, 0);
	this.canApply = function() {
		return this.getDefInfo().unit.jobTypeId === 1210016;
	};
	
	this.adjustValue = function(acc) {
		this.modVal = 10;
		this.result = acc - this.modVal;
	};
}

function AttackAccSp405(actList) { // (Formation Effect) All DEF Rate +%
	AttackAccActionBase.call(this, actList, 2200405, SIDE_DEF, 0);
	
	this.adjustValue = function(acc) {
		this.modPct = this.getPassiveTotalVal();
		this.result = mathClamp(acc - acc * this.modPct * 0.01, 30, 100);
	};
}

function AttackAccSp406(actList) { // (Formation Effect) Attack ACC +%
	AttackAccActionBase.call(this, actList, 2200406, SIDE_ATK, 0);
	
	this.adjustValue = function(acc) {
		this.modPct = this.getPassiveTotalVal();
		this.result = mathClamp(acc + acc * this.modPct * 0.01, 30, 100);
	};
}

function TacticAccActionList(atkInfo) {
	this.atkInfo = atkInfo;
	
	// list special passive for certain hit/miss (no implement)
	// 014: Offensive Tactics Immunity
	// 015: Tactics Immunity
	// 016: Attack Certain Hit
	// 018: Tactics Certain Hit
	// 020: Tactics Defense
	this.actionArr = [
		new TacticAccMaxAcc(this),
		new TacticAccSp030(this), // Tactics ACC +
		new TacticAccSp438(this), // Godly Tactics
		new TacticAccSp520(this), // Fire Tactics Specialization %
		new TacticAccSp578(this), // Wind Tactics Specialization %
		new TacticAccSp590(this), // Water Tactics Specialization %
		new TacticAccSp031(this), // Seduce ACC +
		new TacticAccSp032(this), // Tactics DEF Rate +
		new TacticAccSp510(this), // Relic: Tactics DEF Rate +
		new AttackAccSp033(this), // All DEF Rate + (allowed tactics cannot self target. so can reuse)
		new AttackAccSp208(this), // Narrow Escape (condition) (*0.5)
		new TacticAccSp417(this), // Tactics DEF Rate Pierce
		new TacticAccSp507(this), // Relic: Tactics DEF Rate Pierce
		new TacticAccLightningWeather(this), // lightning accuracy when rain/snow
		new TacticAccSp582(this), // 
		new AttackAccTech026(this), // Research dancer
		// 404: (Formation Effect) Tactics DEF Rate +% (no use in game)
		new TacticAccSp405(this), // (Formation Effect) All DEF Rate +%
		// 407: (Formation Effect) Tactics ACC +% (no use in game)
		// 408: (Formation Effect) All ACC +% (no use in game)
	];
	
	this.setDefInfo = function(defInfo) {
		this.defInfo = defInfo;
		this.calculate();
	};
	
	this.calculate = function() {
		if (this.atkInfo.tactic.accuType === 'Always Hit') {
			this.result = 100;
			return;
		}
		
		if (this.atkInfo.tactic.damageType === 'Physical')
			this.basicAcc = getAttackBasicAcc(this.atkInfo, this.defInfo);
		else
			this.basicAcc = getTacticBasicAcc(this.atkInfo, this.defInfo);
		var acc = this.basicAcc;
		for (var i = 0; i < this.actionArr.length; i++) {
			var tacticAcc = this.actionArr[i];
			if (tacticAcc.needProcess()) {
				tacticAcc.adjustValue(acc);
				acc = tacticAcc.result;
			}
		}
		this.result = acc;
	};
}

function TacticAccMaxAcc(actList) { // Apply tactic max accuracy
	AttackAccActionBase.call(this, actList, 1, SIDE_ATK, 0);
	this.displayName = "Tactic Max Accuracy";
	
	this.adjustValue = function(acc) {
		// allowed tactic is Always Hit or Normal. "Always Hit" tactic is checked before calculation
		this.modPct = this.getAtkInfo().tactic.maxAccu;
		this.result = acc * this.modPct / 100;
	};
}

function TacticAccSp030(actList) { // Tactics ACC +
	AttackAccActionBase.call(this, actList, 2200030, SIDE_ATK, 0);
	
	this.adjustValue = function(acc) {
		this.modPct = this.getPassiveTotalVal();
		this.result = Math.min(acc * (100 + this.modPct) / 100, 100);
	};
}

function TacticAccSp438(actList) { // Godly Tactics
	AttackAccActionBase.call(this, actList, 2200438, SIDE_ATK, 0);
	this.canApply = function() {
		var tactic = this.getTactic();
		return tactic.targetArea !== 13 && tactic.skillType < 4; // no typhoon and must be elemental
	};
	
	this.adjustValue = function(acc) {
		var val = (this.getAtkInfo().attrs['int'] - this.getDefInfo().attrs['int']) / 2;
		this.modPct = mathClamp(val, 0, this.getPassiveTotalVal());
		this.result = mathClamp(acc * (1 + this.modPct * 0.01), 30, 100);
	};
}

function TacticAccSp520(actList) { // Fire Tactics Specialization %
	AttackAccActionBase.call(this, actList, 2200520, SIDE_ATK, 0);
	this.canApply = function() {
		var tactic = this.getTactic();
		return tactic.id === 2000105 || tactic.skillType === 0; // crimson and fire
	};
	
	this.adjustValue = function(acc) {
		this.modPct = this.getPassiveTotalVal();
		this.result = mathClamp(acc * (this.modPct + 100) / 100, 30, 100);
	};
}

function TacticAccSp578(actList) { // Wind Tactics Specialization %
	AttackAccActionBase.call(this, actList, 2200578, SIDE_ATK, 0);
	this.canApply = function() {
		return this.getTactic().skillType === 3;
	};
	
	this.adjustValue = function(acc) {
		this.modPct = this.getPassiveTotalVal();
		this.result = mathClamp(acc * (this.modPct + 100) / 100, 30, 100);
	};
}

function TacticAccSp590(actList) { // Water Tactics Specialization %
	AttackAccActionBase.call(this, actList, 2200590, SIDE_ATK, 0);
	this.canApply = function() {
		return this.getTactic().skillType === 1;
	};
	
	this.adjustValue = function(acc) {
		this.modPct = this.getPassiveTotalVal();
		this.result = mathClamp(acc * (this.modPct + 100) / 100, 30, 100);
	};
}

function TacticAccSp031(actList) { // Seduce ACC +
	AttackAccActionBase.call(this, actList, 2200031, SIDE_ATK, 0);
	this.canApply = function() {
		return this.getTactic().skillType === 5;
	};
	
	this.adjustValue = function(acc) {
		this.modPct = this.getPassiveTotalVal();
		this.result = Math.min(acc + acc * this.modPct * 0.01, 100);
	};
}

function TacticAccSp032(actList) { // Tactics DEF Rate +
	AttackAccActionBase.call(this, actList, 2200032, SIDE_DEF, 0);
	
	this.adjustValue = function(acc) {
		this.modPct = this.getPassiveTotalVal();
		this.result = Math.max(acc * (100 - this.modPct) / 100, 30);
	};
}

function TacticAccSp510(actList) { // Relic: Tactics DEF Rate +
	AttackAccActionBase.call(this, actList, 2200510, SIDE_DEF, 0);
	
	this.adjustValue = function(acc) {
		this.modPct = this.getPassiveTotalVal();
		this.result = mathClamp(acc * (100 - this.modPct) / 100, 30, 100);
	};
}

function TacticAccSp417(actList) { // Tactics DEF Rate Pierce
	AttackAccActionBase.call(this, actList, 2200417, SIDE_ATK, 0);
	
	this.adjustValue = function(acc) {
		this.modPct = this.getPassiveTotalVal();
		this.result = mathClamp(acc * (1 + this.modPct / 100), 30, 100);
	};
}

function TacticAccSp507(actList) { // Relic: Tactics DEF Rate Pierce
	AttackAccActionBase.call(this, actList, 2200507, SIDE_ATK, 0);
	
	this.adjustValue = function(acc) {
		this.modPct = this.getPassiveTotalVal();
		this.result = mathClamp(acc * (1 + this.modPct / 100), 30, 100);
	};
}

function TacticAccSp582(actList) { // Tactics Defense Skill %
	AttackAccActionBase.call(this, actList, 2200582, SIDE_DEF, 1, 0, 'int');
	this.userText = "Hit Count";
	this.userValMax = 5;
	
	this.adjustValue = function(acc) {
		this.modVal = 20; // subtract after applied modPct
		this.modPct = Math.min(this.userVal * this.getPassiveTotalVal(), 100);
		this.result = Math.max(acc - ((acc * this.modPct * 0.01) + this.modVal), 0, 100, 0);
	};
}

function TacticAccLightningWeather(actList) { // lightning accuracy when rain/snow
	AttackAccActionBase.call(this, actList, 1, SIDE_ATK, 0);
	this.displayName = "Lightning and Weather";
	this.canApply = function() {
		return this.getAtkInfo().tactic.id === 2000150;
	};
	
	this.adjustValue = function(acc) {
		if (weatherId < 2) {
			this.modPct = 0;
			this.result = acc;
		}
		else {
			this.modPct = 30;
			this.result = mathClamp(acc * (1 + this.modPct / 100), 30, 100);
		}
	};
}

function TacticAccSp405(actList) { // (Formation Effect) All DEF Rate +%
	AttackAccActionBase.call(this, actList, 2200405, SIDE_DEF, 0);
	
	// the difference from physical attack is minimum value is 0
	this.adjustValue = function(acc) {
		this.modPct = this.getPassiveTotalVal();
		this.result = mathClamp(acc - acc * this.modPct * 0.01, 0, 100);
	};
}


function TacticDmgActionList(atkInfo) {
	this.atkInfo = atkInfo;
	
	this.actionArr = [
		new TacticDmgPower(this, 10),
		new TacticDmgUnitTypeAdv(this, 11), // only for physical tactic
		new TacticDmgUnitTypeFold(this, 12),
		new TacticDmgSpBoost(this, 2200048, [0]), // Fire Tactics +%
		new TacticDmgSpBoost(this, 2200049, [3]), // Wind Tactics +%
		new TacticDmgSpBoost(this, 2200572, [3]), // Wind Tactics Mastery %
		new TacticDmgSpBoost(this, 2200586, [0]), // Fire Tactics Mastery %
		new TacticDmgSpBoost(this, 2200598, [1]), // Water Tactics Mastery %
		new TacticDmgSpBoost(this, 2200050, [1]), // Water Tactics+ %
		new TacticDmgSpBoost(this, 2200051, [2]), // Earth Tactics+ %
		new TacticDmgSpBoost(this, 2200052, [16,17]), // Interrupt Tactics +%
		new TacticDmgSpBoost(this, 2200568, [16,17]), // Interrupt Tactics Mastery %
		new TacticDmgSpBoost(this, 2200054, [0,1,2,3]), // Elemental Tactics +%
		new TacticDmgSpBoost(this, 2200055, null), // Offensive Tactics +%
		new TacticDmgSpBoost(this, 2200573, [0]), // Fire Tactics Synergy %
		new TacticDmgSpBoost(this, 2200574, [3]), // Wind Tactics Synergy %
		new TacticDmgSpBoost(this, 2200575, [16,17]), // Interrupt Tactics Synergy %
		new TacticDmgSpBoost(this, 2200576, null), // Deadly Tactics
		new TacticDmgSp438(this, 2200438), // Godly Tactics
		new TacticDmgSpBoost(this, 2200520, [0]), // Fire Tactics Specialization %
		new TacticDmgSpBoost(this, 2200578, [3]), // Wind Tactics Specialization %
		new TacticDmgSpBoost(this, 2200590, [1]), // Water Tactics Specialization %
		new AttackDmgSp434(this, 2200434), // Impose (Emperor passive)
		new TacticDmgSp056(this, 2200056), // Tactics Damage -%
		new TacticDmgSp588(this, 2200588), // Tactics Offset %
		new TacticDmgSp279(this, 2200279), // Decrease Tactics Damage (no 4gods)
		new TacticDmgSp402(this, 2200402), // Decrease Tactics Damage (by tactic power)
		new TacticDmgSp502(this, 2200502), // Relic: Decrease Tactics Damage
		// freezing damage reduction (only in dragon raid)
		new AttackDmgSp435(this, 2200435), // Dignity (Emperor passive)
		new TacticDmgSpBoost(this, 2200058, [5]), // Seduce +%
		new TacticDmgSpReduction(this, 2200259, 0), // Decrease Fire Tactics Damage %
		new TacticDmgSpReduction(this, 2200260, 3), // Decrease Wind Tactics Damage %
		new TacticDmgSpReduction(this, 2200261, 1), // Decrease Water Tactics Damage %
		new TacticDmgSpReduction(this, 2200262, 2), // Decrease Earth Tactics Damage %
		new TacticDmgTech030(this, 2500030), // Assess Terrain (outlaw)
		//new TacticDmgSp229(this), // (Bloody Battle) Enhanced Offensive Tactics %
		new TacticDmgWeather(this, 13), // 
		new TacticDmgSp420(this, 2200420), // Decrease Area Tactics Damage
		new TacticDmgSp059(this, 2200059), // Double Tactics +%
		new TacticDmgNoSp059(this, 15),
		new AttackDmgRandom(this, 5), // random damage -2 to 4
		new TacticDmgSp061(this, 2200061), // Critical Attack
		new TacticDmgCriticalBonus(this, 16), // additional crit damage from luck diff
		new TacticDmgSp062(this, 2200062), // Critical Attack+
		new TacticDmgSp060(this, 2200060), // Critical Attack Immunity
		new TacticDmgSp027c(this, 2200027), // Special Attack Immunity (crit)
		new TacticDmgSp026(this, 2200026), // Double Tactics Immunity
		new TacticDmgSp027d(this, 2200027), // Special Attack Immunity (double)
		// retreat skill (1-hit ko) (not allowed in simulator)
		// T019: Research Enhance Siege (building related. no implement)
		// T1019: Research Enhance Keep (building related. no implement)
		new TacticDmgSp235(this, 2200235), // (Formation Effect) Enhanced Offensive Tactics
		new TacticDmgSp243(this, 2200243), // (Formation Effect) Tactics Damage Taken
		new TacticDmgSp238(this, 2200238), // (Formation Effect) Normal Tactics Damage Dealt
		// 246: (Formation Effect) Normal Tactics Damage Taken (no use)
		// 239: (Formation Effect) Four Gods Tactics Damage Dealt (no use)
		new TacticDmgSp247(this, 2200247), // (Formation Effect) Four Gods Tactics Damage Taken
		new TacticDmgSp412(this, 2200412), // Enhanced Offensive Tactics
		new TacticDmgSp498(this, 2200498), // Relic: Amplify Offensive Tactics
		// 534: Vermilion Bird: Might (only for 4god ascend. no implement)
		new AttackDmgSp272(this, 2200272), // Max Damage Defense %
		new TacticDmgSp415(this, 2200415), // Guard
		new TacticDmgSp422(this, 2200422), // Song: Tactics Damage -%
		// 462: Main Attack + (noone has)
		new TacticDmgPatience(this, 18), // swift calvary tactic
		new TacticDmgComposure(this, 19), // swift calvary tactic
		new AttackDmgFlameMark(this, 7),
	];
	
	this.setDefInfo = function(defInfo) {
		this.defInfo = defInfo;
		this.calculate();
	};
	
	this.calculate = function() {
		var tactic = this.atkInfo.tactic;
		if (tactic.damageType === 'None') {
			this.basicDmg = this.result = 0;
			return;
		}
		
		if (tactic.damageType === 'Physical')
			this.basicDmg = _getTacticPhysicalBasicDmg(this.atkInfo, this.defInfo);
		else
			this.basicDmg = _getTacticMagicBasicDmg(this.atkInfo, this.defInfo);
		var dmg = this.basicDmg;
		for (var i = 0; i < this.actionArr.length; i++) {
			var action = this.actionArr[i];
			if (action.needProcess()) {
				action.handleTriggerablePassive();
				action.adjustValue(dmg);
				dmg = action.result;
			}
		}
		this.result = monoMathRound(Math.max(1, dmg));
	};
}

function _isAttackSkill(tactic) {
	// other 2 types for offensive skills are riddle and 4gods
	return [0,1,2,3,4,5,16,17,49].indexOf(tactic.skillType) !== -1;
}

function TacticDmgPower(actList, actId) {
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	this.displayName = 'Tactic Power';
	
	this.adjustValue = function(dmg) {
		this.modPct = this.getTactic().skillPower;
		this.result = dmg * this.modPct / 100;
	};
}

function TacticDmgUnitTypeAdv(actList, actId) {
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	this.displayName = 'Unit Type Advantage';
	this.canApply = function() {
		return this.getTactic().damageType === 'Physical';
	};
	
	this.adjustValue = function(dmg) {
		var val = this.getAtkInfo().unitType.typeAdv[this.getDefInfo().unit.jobTypeId] ;
		this.modPct = val - 100;
		this.result = dmg * val / 100;
	};
}

function TacticDmgUnitTypeFold(actList, actId) {
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	this.displayName = 'Unit Type Tactic Fold';
	
	this.adjustValue = function(dmg) {
		var val = this.getAtkInfo().jobInfo.skillFold;
		this.modPct = val - 100;
		this.result = dmg * val / 100;
	};
}

function TacticDmgSpBoost(actList, actId, allowTypes, allowIds=[]) {
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	this.allowTypes = allowTypes; // null for allow all. only offensive tactics get calculated
	this.allowIds = allowIds;
	this.canApply = function() {
		if (this.allowTypes === null)
			return true;
		var tactic = this.getTactic();
		return (this.allowTypes.indexOf(tactic.skillType) !== -1) || (this.allowIds.indexOf(tactic.id) !== -1);
	};
	
	this.adjustValue = function(dmg) {
		this.modPct = this.getPassiveTotalVal();
		this.result = dmg * (this.modPct + 100) / 100;
	};
}

function TacticDmgSp438(actList, actId) { // Godly Tactics
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	this.canApply = function() {
		var tactic = this.getTactic();
		return tactic.targetArea !== 13 && tactic.skillType < 4; // no typhoon and must be elemental
	};
	
	this.adjustValue = function(dmg) {
		var val = (this.getAtkInfo().attrs['int'] - this.getDefInfo().attrs['int']) / 2;
		this.modPct = mathClamp(val, 0, this.getPassiveTotalVal());
		this.result = dmg * (1 + this.modPct * 0.01);
	};
}

function TacticDmgSp056(actList, actId) { // Tactics Damage -%
	AttackAccActionBase.call(this, actList, actId, SIDE_DEF, 0);
	this.canApply = function() {
		return _isAttackSkill(this.getTactic());
	};
	
	this.adjustValue = function(dmg) {
		this.modPct = this.getPassiveTotalVal();
		this.result = dmg - dmg * (this.modPct / 100);
	};
}

function TacticDmgSp588(actList, actId) { // Tactics Offset %
	AttackAccActionBase.call(this, actList, actId, SIDE_DEF, 0);
	this.canApply = function() {
		var tactic = this.getTactic();
		return _isAttackSkill(tactic) || tactic.skillType === 25; // not include riddle
	};
	
	this.adjustValue = function(dmg) {
		this.modPct = this.getPassiveTotalVal();
		this.result = dmg - dmg * (this.modPct / 100);
	};
}

function TacticDmgSp279(actList, actId) { // Decrease Tactics Damage (no 4gods)
	AttackAccActionBase.call(this, actList, actId, SIDE_DEF, 0);
	this.canApply = function() {
		return _isAttackSkill(this.getTactic());
	};
	
	this.adjustValue = function(dmg) {
		this.modVal = this.getPassiveTotalVal();
		this.result = dmg - this.modVal;
	};
}

function TacticDmgSp402(actList, actId) { // Decrease Tactics Damage (by tactic power)
	AttackAccActionBase.call(this, actList, actId, SIDE_DEF, 0);
	
	this.adjustValue = function(dmg) {
		this.modVal = this.getPassiveTotalVal() * this.getTactic().skillPower * 0.01;
		this.result = dmg - this.modVal;
	};
}

function TacticDmgSp502(actList, actId) { // Relic: Decrease Tactics Damage
	AttackAccActionBase.call(this, actList, actId, SIDE_DEF, 0);
	
	this.adjustValue = function(dmg) {
		this.modVal = this.getPassiveTotalVal() * this.getTactic().skillPower * 0.01;
		this.result = dmg - this.modVal;
	};
}

function TacticDmgSpReduction(actList, actId, allowType) {
	AttackAccActionBase.call(this, actList, actId, SIDE_DEF, 0);
	this.allowType = allowType;
	this.canApply = function() {
		return this.getTactic() === this.allowType;
	};
	
	this.adjustValue = function(dmg) {
		this.modPct = this.getPassiveTotalVal();
		this.result = dmg - dmg * (this.modPct / 100);
	};
}

function TacticDmgTech030(actList, actId) { // Assess Terrain (outlaw)
	AttackAccActionBase.call(this, actList, actId, SIDE_DEF, 0);
	this.canApply = function() {
		return this.getTactic().skillType === 2 && this.getDefInfo().unit.jobTypeId === 1210012;
	};
	
	this.adjustValue = function(dmg) {
		this.modPct = 50;
		this.result = dmg - dmg * this.modPct * 0.01;
	};
}

function TacticDmgWeather(actList, actId) {
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	this.displayName = "Weather Effect";
	this.canApply = function() {
		var tactic = this.getTactic();
		if (weatherId === 0 && tactic.skillType === 0) // sun
			return true;
		if (weatherId === 1 && tactic.skillType === 2) // cloud
			return true;
		if (weatherId === 2 && tactic.skillType === 1) // rain
			return true;
		if (weatherId === 4 && tactic.skillType === 3) // snow
			return true;
		if (weatherId === 3 && (tactic.skillType === 1 || tactic.skillType === 3)) // storm
			return true;
		return false;
	};
	
	this.adjustValue = function(dmg) {
		this.modPct = 15;
		this.result = dmg * 1.15;
	};
}

function TacticDmgSp420(actList, actId) { // Decrease Area Tactics Damage
	AttackAccActionBase.call(this, actList, actId, SIDE_DEF, 0);
	this.canApply = function() {
		var tactic = this.getTactic();
		return tactic.skillType !== 25 && tactic.effectArea !== 0;
	};
	
	this.adjustValue = function(dmg) {
		this.modPct = this.getPassiveTotalVal();
		this.result = dmg * (1 - this.modPct * 0.01);
	};
}

function TacticDmgSp059(actList, actId) { // Double Tactics +%
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	this.canApply = function() {
		return this.getAtkInfo().isDoubleTactic;
	};
	
	this.adjustValue = function(dmg) {
		this.result = dmg;
	};
}

function TacticDmgNoSp059(actList, actId) {
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	this.displayName = "Double Tactics Dmg Reduction";
	this.canApply = function() {
		var atkInfo = this.getAtkInfo();
		return atkInfo.isDoubleTactic && !atkInfo.hasPassive(2200059);
	};
	
	this.adjustValue = function(dmg) {
		this.modPct = 25;
		this.result = dmg * 75 / 100;
	};
}

function TacticDmgSp061(actList, actId) { // Critical Attack
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	this.needProcess = function() {
		return this.getAtkInfo().isCriticalTactic;
	};
	
	this.adjustValue = function(dmg) {
		this.modPct = 50;
		this.result = dmg * 1.5;
	};
}

function TacticDmgCriticalBonus(actList, actId) { // additional crit damage from luck diff
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	this.displayName = "Extra Critical Dmg from LCK";
	this.canApply = function() {
		return this.getAtkInfo().isCriticalTactic;
	};
	
	this.adjustValue = function(dmg) {
		var val = (this.getAtkInfo().attrs['lck'] - this.getDefInfo().attrs['lck']) / 4;
		this.modPct = Math.max(val, 0);
		this.result = dmg * (1 + this.modPct/100);
	};
}

function TacticDmgSp062(actList, actId) { // Critical Attack+
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	this.canApply = function() {
		return this.getAtkInfo().isCriticalTactic;
	};
	
	this.adjustValue = function(dmg) {
		this.modPct = this.getPassiveTotalVal();
		this.result = dmg * (1 + this.modPct/100);
	};
}

function TacticDmgSp060(actList, actId) { // Critical Attack Immunity (Tactic)
	AttackAccActionBase.call(this, actList, actId, SIDE_DEF, 1, 1, 'bool');
	this.userText = 'Activated';
	this.canApply = function() {
		return this.getAtkInfo().isCriticalTactic && !this.getDefInfo().hasPassive(2200027);
	};
	
	this.adjustValue = function(dmg) {
		this.modPct = (this.userVal) ? 100 : 0;
		this.result = (this.userVal) ? 0 : dmg;
	};
}

function TacticDmgSp027c(actList, actId) { // Special Attack Immunity (Tactic, Critical)
	AttackAccActionBase.call(this, actList, actId, SIDE_DEF, 1, 1, 'bool');
	this.id = actId + 'c'; // overwrite id for unique id
	this.userText = 'Activated';
	this.canApply = function() {
		return this.getAtkInfo().isCriticalTactic;
	};
	
	this.adjustValue = function(dmg) {
		this.modPct = (this.userVal) ? 100 : 0;
		this.result = (this.userVal) ? 0 : dmg;
	};
}

function TacticDmgSp026(actList, actId) { // Double Tactics Immunity
	AttackAccActionBase.call(this, actList, actId, SIDE_DEF, 1, 1, 'bool');
	this.userText = 'Activated';
	this.canApply = function() {
		return this.getAtkInfo().isDoubleTactic && !this.getDefInfo().hasPassive(2200027);
	};
	
	this.adjustValue = function(dmg) {
		this.modPct = (this.userVal) ? 100 : 0;
		this.result = (this.userVal) ? 0 : dmg;
	};
}

function TacticDmgSp027d(actList, actId) { // Special Attack Immunity (Tactic, dobule)
	AttackAccActionBase.call(this, actList, actId, SIDE_DEF, 1, 1, 'bool');
	this.id = actId + 'd'; // overwrite id for unique id
	this.userText = 'Activated';
	this.canApply = function() {
		return this.getAtkInfo().isDoubleTactic;
	};
	
	this.adjustValue = function(dmg) {
		this.modPct = (this.userVal) ? 100 : 0;
		this.result = (this.userVal) ? 0 : dmg;
	};
}

function TacticDmgSp235(actList, actId) { // (Formation Effect) Enhanced Offensive Tactics
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	
	this.adjustValue = function(dmg) {
		this.modVal = this.getPassiveTotalVal();
		this.result = dmg + this.modVal;
	};
}

function TacticDmgSp243(actList, actId) { // (Formation Effect) Tactics Damage Taken
	AttackAccActionBase.call(this, actList, actId, SIDE_DEF, 0);
	
	this.adjustValue = function(dmg) {
		this.modVal = this.getPassiveTotalVal();
		this.result = dmg + this.modVal;
	};
}

function TacticDmgSp238(actList, actId) { // (Formation Effect) Normal Tactics Damage Dealt
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	this.canApply = function() {
		return this.getTactic().skillType !== 25;
	};
	
	this.adjustValue = function(dmg) {
		this.modVal = this.getPassiveTotalVal();
		this.result = dmg + this.modVal;
	};
}

function TacticDmgSp247(actList, actId) { // (Formation Effect) Four Gods Tactics Damage Taken
	AttackAccActionBase.call(this, actList, actId, SIDE_DEF, 0);
	this.canApply = function() {
		return this.getTactic().skillType === 25;
	};
	
	this.adjustValue = function(dmg) {
		this.modVal = this.getPassiveTotalVal();
		this.result = dmg + this.modVal;
	};
}

function TacticDmgSp412(actList, actId) { // Enhanced Offensive Tactics
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	
	this.adjustValue = function(dmg) {
		this.modVal = this.getPassiveTotalVal();
		this.result = dmg + this.modVal;
	};
}

function TacticDmgSp498(actList, actId) { // Relic: Amplify Offensive Tactics
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	
	this.adjustValue = function(dmg) {
		this.modVal = this.getPassiveTotalVal() * this.getTactic().skillPower * 0.01;
		this.result = dmg + this.modVal;
	};
}

function TacticDmgSp415(actList, actId) { // Guard
	AttackAccActionBase.call(this, actList, actId, SIDE_DEF, 1, 0, 'bool');
	this.userText = 'Activated';
	this.canApply = function() {
		return this.getTactic().effectArea === 0;
	};
	
	this.adjustValue = function(dmg) {
		if (this.userVal) {
			this.modPct = this.getPassiveTotalVal();
			this.result = dmg * (100 - this.modPct) / 100;
		}
		else {
			this.modPct = 0;
			this.result = dmg;
		}
	};
}

function TacticDmgSp422(actList, actId) { // Song: Tactics Damage -%
	AttackAccActionBase.call(this, actList, actId, SIDE_DEF, 2, 0, 'bool');
	this.userText = 'In Song Aura';
	this.canApply = function() {
		return _isAttackSkill(this.getTactic());
	};
	
	this.adjustValue = function(dmg) {
		if (this.userVal) {
			this.modPct = 25;
			this.result = dmg - dmg * this.modPct / 100;
		}
		else {
			this.modPct = 0;
			this.result = dmg;
		}
	};
}

function TacticDmgPatience(actList, actId) { // swift calvary Patience tactic
	AttackAccActionBase.call(this, actList, actId, SIDE_DEF, 1, 0, 'bool');
	this.displayName = _findObj(2000170, tactics).name;
	this.userText = 'Activated';
	this.canApply = function() {
		return this.getTactic().skillType !== 25 && this.getDefInfo().unit.jobTypeId === 1210078;
	};
	
	this.adjustValue = function(dmg) {
		if (this.userVal) {
			this.modPct = 20;
			this.result = dmg + dmg * this.modPct / 100;
		}
		else {
			this.modPct = 0;
			this.result = dmg;
		}
	};
}

function TacticDmgComposure(actList, actId) { // swift calvary Tranquility tactic
	AttackAccActionBase.call(this, actList, actId, SIDE_DEF, 1, 0, 'bool');
	this.displayName = _findObj(2000171, tactics).name;
	this.userText = 'Activated';
	this.canApply = function() {
		return this.getTactic().skillType !== 25 && this.getDefInfo().unit.jobTypeId === 1210078;
	};
	
	this.adjustValue = function(dmg) {
		if (this.userVal) {
			this.modPct = 20;
			this.result = dmg - dmg * this.modPct / 100;
		}
		else {
			this.modPct = 0;
			this.result = dmg;
		}
	};
}

function AttackDmgActionList(atkInfo) {
	this.atkInfo = atkInfo;
	
	// wheel upgrade and charge attack are calcuated together (also use step count)
	this.actionSp570 = new AttackDmgSp570(this, 2200570); // wheel upgrade %
	this.actionSp009 = new AttackDmgSp009(this, 2200009); // % charge attack
	
	this.actionSp543 = new AttackDmgSp543(this, 2200543); // Mortal Blaze (assume main target)
	this.actionFlameMark = new AttackDmgFlameMark(this, 42);
	
	this.actionArr = [
		new AttackDmgRangeFold(this, 20),
		new AttackDmgUnitTypeAdv(this, 21),
		new AttackDmgSp042(this, 2200042), // Ignore Mounted Attack+
		new AttackDmgSp043(this, 2200043), // Mounted ATK +%
		new AttackDmgTech028(this, 2500028), // Mount Slayer
		new AttackDmgSp044(this, 2200044), // Physical Attack +%
		new AttackDmgSp434(this, 2200434), // Impose (Emperor passive)
		//new AttackDmgSp228(this, 2200228), // (Bloody Battle) Enhanced Physical Attack %
		new AttackDmgSp036(this, 2200036), // Naval Battle +
		new AttackDmgSp045(this, 2200045), // Physical Damage -%
		//new AttackDmgSp448(this, 2200448), // Azure Dragon's Protection
		//new AttackDmgSp449(this, 2200449), // Azure Dragon's Blessing
		new AttackDmgSp280(this, 2200280), // Decrease Physical Damage
		new AttackDmgSp500(this, 2200500), // Relic: Melee Damage -
		new AttackDmgSp046(this, 2200046), // Ranged DMG -%
		new AttackDmgSp501(this, 2200501), // Relic: Ranged Damage -
		new AttackDmgSp435(this, 2200435), // Dignity (Emperor passive)
		//new AttackDmgSp185(this, 2200185), // Keep (for keep only)
		new AttackDmgSp057(this, 2200057), // MP Attack
		//new AttackDmgTech1019(this, 2501019), // Enhance Keep
		new AttackDmgTech027(this, 2500027), // Research: Ship Construction (navy)
		new AttackDmgSp446(this, 2200446), // CMD: Physical Attack +%
		new AttackDmgDoubleSp022(this, 2200022), // Normal double attack with leading
		new AttackDmgDoubleSp023(this, 2200023), // Normal double attack with chain
		new AttackDmgDoubleSp047(this, 2200047), // Enhanced Double ATK % (normal)
		new AttackDmgTech014(this, 2500014), // Research: Counter Archery 1
		new AttackDmgTech024(this, 2500024), // Research: Counter Riding
		new AttackDmgCounter(this, 25), // Counterattack damage reduction
		new AttackDmgCounterSp096(this, 2200096), // Counterattack+
		new AttackDmgCounterSp023(this, 2200023), // Counterattack with chain attack
		new AttackDmgReversal(this, 28), // Reversal damage reduction
		new AttackDmgReversalSp096(this, 2200096), // Counterattack+ (reversal)
		// 533: Vermilion Bird: Quick Reflexes (for 4god only)
		new AttackDmgReversalSp581(this, 2200581), // Quick Reflexes % (Reversal Phalanx)
		new AttackDmgJoint(this, 30), // Joint attack damage reduction
		new AttackDmgJointSp047(this, 2200047), // Enhanced Double ATK % (joint)
		new AttackDmgJointSp445(this, 2200445), // Oathkeeper (joint)
		new AttackDmgPhalanx(this, 32), // Phalanx attack damage reduction
		new AttackDmgPhalanxSp047(this, 2200047), // Enhanced Double ATK % (phalanx)
		// 533: Vermilion Bird: Quick Reflexes (for 4god only)
		new AttackDmgPhalanxSp581(this, 2200581), // Quick Reflexes %
		new AttackDmgPhalanxSp445(this, 2200445), // Oathkeeper (Phalanx)
		new AttackDmgSp585(this, 2200585), // Zhao Family Triple Strike
		new AttackDmgRandom(this, 35), // random damage -2 to 4
		this.actionSp570, // wheel upgrade %
		this.actionSp009, // % charge attack
		new AttackDmgSp061(this, 2200061), // Critical Attack
		new AttackDmgCriticalBonus(this, 36), // additional crit damage from luck diff
		new AttackDmgSp062(this, 2200062), // Critical Attack+
		// 527: Critical Hit Damage -% (only 4god bird has)
		new AttackDmgSp060(this, 2200060), // Critical Attack Immunity
		new AttackDmgSp027c(this, 2200027), // Special Attack Immunity (crit)
		new AttackDmgSp017(this, 2200017), // Physical Certain Hit
		new AttackDmgSp025(this, 2200025), // Double ATK Immunity
		new AttackDmgSp027d(this, 2200027), // Special Attack Immunity (double)
		new AttackDmgTech010(this, 2500010), // Research: Ambush 1
		//new AttackDmgTech019(this, 2500019), // Research: Enhance Siege 1
		new AttackDmgTech023(this, 2500023), // Research: Exploit Weakness
		new AttackDmgSp234(this, 2200234), // (Formation Effect) Enhanced Physical Attack
		new AttackDmgSp242(this, 2200242), // (Formation Effect) Physical Damage Taken
		new AttackDmgSp237(this, 2200237), // (Formation Effect) Ranged Damage Dealt
		new AttackDmgSp245(this, 2200245), // (Formation Effect) Ranged Damage Taken
		new AttackDmgSp236(this, 2200236), // (Formation Effect) Melee Damage Dealt
		// 244: (Formation Effect) Melee Damage Taken
		new AttackDmgSp240(this, 2200240), // (Formation Effect) Mounted Damage Dealt
		// 248: (Formation Effect) Mounted Damage Taken
		new AttackDmgSp411(this, 2200411), // Enhanced Physical Attack
		new AttackDmgSp496(this, 2200496), // Relic: Melee Attack +
		new AttackDmgSp497(this, 2200497), // Relic: Ranged Attack +
		new AttackDmgSp266(this, 2200266), // Attack Damage %
		new AttackDmgSp267(this, 2200267), // Status Effect Attack Damage %
		new AttackDmgSp268(this, 2200268), // Absorb Attack Damage %
		//new AttackDmgSp523(this, 2200523), // Vermilion Bird: Scarlet Dagger
		new AttackDmgSp272(this, 2200272), // Max Damage Defense %
		new AttackDmgSp418(this, 2200418), // Deadly Attack
		new AttackDmgSp101(this, 2200101), // Desperate Attack
		// 462: Main Attack + (noone has)
		new AttackDmgSp415(this, 2200415), // Guard
		new AttackDmgSp421(this, 2200421), // Song: Physical Damage -%
		// 522: Vermilion Bird: Fire Attack % (only 4god)
		new AttackDmgSp542(this, 2200542), // Fire Attack % (main target only)
		new AttackDmgPatience(this, 38), // swift calvary tactic
		new AttackDmgComposure(this, 39), // swift calvary tactic
		new AttackDmgSp443(this, 2200443), // Overwhelm
		this.actionSp543, // Mortal Blaze (assume main target)
		this.actionFlameMark,
		new AttackDmgSp570e(this, 2200570), // wheel upgrade (non-main target)
	];
	
	this.setDefInfo = function(defInfo) {
		this.defInfo = defInfo;
		this.calculate();
	};
	
	this.calculate = function() {
		this.basicDmg = getAttackBasicDmg(this.atkInfo, this.defInfo);
		var dmg = this.basicDmg;
		for (var i = 0; i < this.actionArr.length; i++) {
			var action = this.actionArr[i];
			if (action.needProcess()) {
				action.handleTriggerablePassive();
				action.adjustValue(dmg);
				dmg = action.result;
			}
		}
		this.result = monoMathRound(Math.max(1, dmg));
	};
}

function AttackDmgRangeFold(actList, actId) {
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	this.displayName = 'Range Damage Fold';
	this.canApply = function() {
		// only bow and xbox has projectileFold (cata is 100 for catapultFold)
		// to be precise in all case. isProjectile, isCatapult, projectTileFold, catapultFold must be exported
		var atkInfo = this.getAtkInfo();
		return atkInfo.attackRole === 'Range' && atkInfo.unit.jobTypeId !== 1210010;
	};
	
	this.adjustValue = function(dmg) {
		this.modPct = 5;
		this.result = dmg * 105 / 100;
	};
}

function AttackDmgUnitTypeAdv(actList, actId) {
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	this.displayName = 'Unit Type Advantage';
	
	this.adjustValue = function(dmg) {
		var val = this.getAtkInfo().unitType.typeAdv[this.getDefInfo().unit.jobTypeId] ;
		this.modPct = val - 100;
		this.result = dmg * val / 100;
	};
}

function AttackDmgSp042(actList, actId) { // Ignore Mounted Attack+
	AttackAccActionBase.call(this, actList, actId, SIDE_DEF, 0);
	this.canApply = function() { // non cavalry unit should have this passive
		return isCavalryUnit(this.getActionUserInfo().unit.jobTypeId);
	};
	
	this.adjustValue = function(dmg) {
		this.modPct = 0;
		this.result = dmg;
	};
}

function AttackDmgSp043(actList, actId) { // Mounted ATK +%
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	this.canApply = function() {
		var defInfo = this.getDefInfo();
		return isCavalryUnit(defInfo.unit.jobTypeId) && !defInfo.hasPassive(2200042);
	};
	
	this.adjustValue = function(dmg) {
		this.modPct = this.getPassiveTotalVal();
		this.result = dmg + dmg * this.modPct / 100;
	};
}

function AttackDmgTech028(actList, actId) { // Research: Mount Slayer
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	this.canApply = function() {
		var defInfo = this.getDefInfo();
		return isCavalryUnit(defInfo.unit.jobTypeId) && !defInfo.hasPassive(2200042) && this.getAtkInfo().unit.jobTypeId === 1210005;
	};
	
	this.adjustValue = function(dmg) {
		this.modPct = 40;
		this.result = dmg + dmg * this.modPct * 0.01;
	};
}

function AttackDmgSp044(actList, actId) { // Physical Attack +%
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	
	this.adjustValue = function(dmg) {
		this.modPct = this.getPassiveTotalVal();
		this.result = dmg + dmg * this.modPct / 100;
	};
}

function AttackDmgSp434(actList, actId) { // Impose (Emperor passive)
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	
	this.adjustValue = function(dmg) {
		var defMrl = this.getDefInfo().stat['mrl'];
		var val = Math.ceil((this.getAtkInfo().stat['mrl'] - defMrl) / defMrl / 2 * 100);
		this.modPct = mathClamp(val, 0, this.getPassiveTotalVal());
		this.result = dmg * (1 + this.modPct / 100);
	};
}

function AttackDmgSp036(actList, actId) { // Naval Battle +
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	this.canApply = function() {
		return (this.getAtkInfo().tileId in this.getPassive().tileAdvs);
	};
	
	this.adjustValue = function(dmg) {
		this.modPct = this.getPassiveTotalVal();
		this.result = dmg + dmg * this.modPct / 100;
	};
}

function AttackDmgSp045(actList, actId) { // Physical Attack -%
	AttackAccActionBase.call(this, actList, actId, SIDE_DEF, 0);
	
	this.adjustValue = function(dmg) {
		this.modPct = this.getPassiveTotalVal();
		this.result = Math.max(0, dmg - dmg * this.modPct / 100);
	};
}

function AttackDmgSp280(actList, actId) { // Decrease Physical Damage
	AttackAccActionBase.call(this, actList, actId, SIDE_DEF, 0);
	
	this.adjustValue = function(dmg) {
		this.modVal = this.getPassiveTotalVal();
		this.result = Math.max(0, dmg - this.modPct);
	};
}

function AttackDmgSp500(actList, actId) { // Relic: Melee Damage -
	AttackAccActionBase.call(this, actList, actId, SIDE_DEF, 0);
	this.canApply = function() {
		return this.getAtkInfo().attackRole !== 'Range';
	};
	
	this.adjustValue = function(dmg) {
		this.modVal = this.getPassiveTotalVal();
		this.result = Math.max(0, dmg - this.modPct);
	};
}

function AttackDmgSp046(actList, actId) { // Ranged DMG -%
	AttackAccActionBase.call(this, actList, actId, SIDE_DEF, 0);
	this.canApply = function() {
		return this.getAtkInfo().attackRole === 'Range';
	};
	
	this.adjustValue = function(dmg) {
		this.modPct = this.getPassiveTotalVal();
		this.result = dmg - dmg * this.modPct / 100;
	};
}

function AttackDmgSp501(actList, actId) { // Relic: Ranged Damage -
	AttackAccActionBase.call(this, actList, actId, SIDE_DEF, 0);
	this.canApply = function() {
		return this.getAtkInfo().attackRole === 'Range';
	};
	
	this.adjustValue = function(dmg) {
		this.modVal = this.getPassiveTotalVal();
		this.result = Math.max(0, dmg - this.modPct);
	};
}
		
function AttackDmgSp435(actList, actId) { // Dignity (Emperor passive)
	AttackAccActionBase.call(this, actList, actId, SIDE_DEF, 0);
	
	this.adjustValue = function(dmg) {
		var atkMrl = this.getDefInfo().stat['mrl'];
		var val = Math.ceil((this.getDefInfo().stat['mrl'] - atkMrl) / atkMrl / 2 * 100);
		this.modPct = mathClamp(val, 0, this.getPassiveTotalVal());
		this.result = dmg * (1 - this.modPct / 100);
	};
}

function AttackDmgSp057(actList, actId) { // MP Attack
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	
	this.adjustValue = function(dmg) {
		this.modVal = this.getAtkInfo().mp; // Note: ToG is 50% of mp
		this.result = dmg + this.modVal;
	};
}

function AttackDmgTech027(actList, actId) { // Research: Ship Construction (navy)
	AttackAccActionBase.call(this, actList, actId, SIDE_DEF, 0);
	this.canApply = function() {
		var defInfo = this.getDefInfo();
		return this.getAtkInfo().attackRole === 'Range' && defInfo.unit.jobTypeId === 1210019 && defInfo.terrain === 4200014;
	};
	
	this.adjustValue = function(dmg) {
		this.modPct = 50;
		this.result = dmg - dmg * this.modPct * 0.01;
	};
}

function AttackDmgSp446(actList, actId) { // CMD: Physical Attack +%
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 2, 0, 'bool');
	this.userText = 'In Emperor Aura';
	
	this.adjustValue = function(dmg) {
		if (this.userVal) {
			this.modPct = 15; // passive from Emperor tactic (fixed value here)
			this.result = dmg * (100 + this.modPct) / 100;
		} else {
			this.modPct = 0;
			this.result = dmg;
		}
	};
}

function _isNormalDoubleAttack(atkInfo) {
	// normal, guiding, penetration, desperate
	return (atkInfo.attackType === 0 || atkInfo.attackType >= 5) && atkInfo.isDoubleAttack;
}

function _getDoubleAttackModPct(atkInfo, defInfo) {
	if (atkInfo.getStat('agi') < defInfo.getStat('agi') * 3)
		return 75;
	return 100;
}

function AttackDmgDoubleSp022(actList, actId) { // Normal double attack with leading
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	this.canApply = function() {
		var atkInfo = this.getAtkInfo(); // must no chain
		return _isNormalDoubleAttack(atkInfo) && !atkInfo.hasPassive(2200023);
	};
	
	this.adjustValue = function(dmg) {
		this.modPct = _getDoubleAttackModPct(this.getAtkInfo(), this.getDefInfo());
		this.result = dmg * this.modPct / 100;
	};
}

function AttackDmgDoubleSp023(actList, actId) { // Normal double attack with chain
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	this.canApply = function() {
		return _isNormalDoubleAttack(this.getAtkInfo());
	};
	
	this.adjustValue = function(dmg) {
		this.modPct = _getDoubleAttackModPct(this.getAtkInfo(), this.getDefInfo());
		this.result = dmg * this.modPct / 100;
	};
}

function AttackDmgDoubleSp047(actList, actId) { // Enhanced Double ATK % (Normal double)
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	this.canApply = function() {
		return _isNormalDoubleAttack(this.getAtkInfo());
	};
	
	this.adjustValue = function(dmg) {
		this.modPct = this.getPassiveTotalVal();
		this.result = dmg * (100 + this.modPct) / 100;
	};
}

function AttackDmgTech014(actList, actId) { // Research: Counter Archery 1
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 2, 0, 'bool');
	this.userText = 'Enemy in blind spot';
	this.canApply = function() {
		var atkInfo = this.getAtkInfo();
		if (atkInfo.attackType !== 1 || atkInfo.hasPassive(2200094))
			return false; // Unlimited Counterattack
		var weaponType = atkInfo.allowItemTypes[0];
		return weaponType === 3 || weaponType === 4; // bow or xbow
	};
	
	this.adjustValue = function(dmg) {
		if (this.userVal) {
			this.modPct = 30;
			this.result = dmg * this.modPct / 100;
		}
		else {
			this.modPct = 0;
			this.result = dmg;
		}
	};
}

function AttackDmgTech024(actList, actId) { // Research: Counter Riding
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 2, 0, 'bool');
	this.userText = 'Enemy in blind spot';
	this.canApply = function() {
		var atkInfo = this.getAtkInfo();
		if (atkInfo.attackType !== 1 || atkInfo.hasPassive(2200094))
			return false; // Unlimited Counterattack
		return atkInfo.unit.jobTypeId === 1210006; // light cavalry only
	};
	
	this.adjustValue = function(dmg) {
		if (this.userVal) {
			this.modPct = 50;
			this.result = dmg * this.modPct / 100;
		}
		else {
			this.modPct = 0;
			this.result = dmg;
		}
	};
}

function AttackDmgCounter(actList, actId) { // Counterattack without passives
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	this.displayName = 'Counterattack Damage';
	this.canApply = function() {
		// no counterattack+ and chain attack
		var atkInfo = this.getAtkInfo();
		return atkInfo.attackType === 1  && !atkInfo.hasPassive(2200096) && !atkInfo.hasPassive(2200023);
	};
	
	this.adjustValue = function(dmg) {
		this.modPct = 75;
		this.result = dmg * 0.75;
	};
}

function AttackDmgCounterSp096(actList, actId) { // Counterattack+
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	this.canApply = function() {
		// no chain attack
		var atkInfo = this.getAtkInfo();
		return atkInfo.attackType === 1 && !atkInfo.hasPassive(2200023);
	};
	
	this.adjustValue = function(dmg) {
		this.result = dmg;
	};
}

function AttackDmgCounterSp023(actList, actId) { // Counterattack with chain attack
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	this.canApply = function() {
		var modPct = _getDoubleAttackModPct(this.getAtkInfo(), this.getDefInfo());
		return this.getAtkInfo().attackType === 1 && modPct !== 100;
	};
	
	this.adjustValue = function(dmg) {
		this.modPct = 75; // TODO: decide again regarding to display info
		this.result = dmg * 75 / 100;
	};
}

function AttackDmgReversal(actList, actId) { // Reversal without passive
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	this.displayName = 'Reversal Damage';
	this.canApply = function() {
		// no counterattack+
		var atkInfo = this.getAtkInfo();
		return atkInfo.attackType === 3  && !atkInfo.hasPassive(2200096);
	};
	
	this.adjustValue = function(dmg) {
		this.modPct = 75;
		this.result = dmg * 0.75;
	};
}

function AttackDmgReversalSp096(actList, actId) { // Counterattack+ (reversal case)
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	this.canApply = function() {
		return this.getAtkInfo().attackType === 3;
	};
	
	this.adjustValue = function(dmg) {
		this.result = dmg;
	};
}

function AttackDmgReversalSp581(actList, actId) { // Quick Reflexes % (Reversal Phalanx)
	AttackAccActionBase.call(this, actList, actId, SIDE_DEF, 1, 0, 'bool');
	this.userText = 'Reversal Phalanx';
	this.canApply = function() {
		var atkInfo = this.getAtkInfo(); // must have phalanx
		return atkInfo.attackType === 3 && atkInfo.hasPassive(2200097);
	};
	
	this.adjustValue = function(dmg) {
		if (this.userVal) {
			this.modPct = this.getPassiveTotalVal();
			this.result = dmg - (dmg * this.modPct * 0.01);
		}
		else {
			this.modPct = 0;
			this.result = dmg;
		}
	};
}

function AttackDmgJoint(actList, actId) { // Joint attack damage reduction
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	this.displayName = 'Joint Attack Damage';
	this.canApply = function() {
		return this.getAtkInfo().attackType === 2;
	};
	
	this.adjustValue = function(dmg) {
		this.modPct = 70;
		this.result = dmg * 7 / 10;
	};
}

function AttackDmgJointSp047(actList, actId) { // Enhanced Double ATK % (joint)
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	this.canApply = function() {
		return this.getAtkInfo().attackType === 2 && this.getAtkInfo().isDoubleAttack;
	};
	
	this.adjustValue = function(dmg) {
		this.modPct = this.getPassiveTotalVal();
		this.result = dmg * (100 + this.modPct) / 100;
	};
}

function AttackDmgJointSp445(actList, actId) { // Oathkeeper (joint)
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	this.canApply = function() {
		return this.getAtkInfo().attackType === 2;
	};
	
	this.adjustValue = function(dmg) {
		this.modPct = this.getPassiveTotalVal();
		this.result = dmg * (1 + this.modPct * 0.01);
	};
}

function AttackDmgPhalanx(actList, actId) { // Phalanx attack damage reduction
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	this.displayName = 'Phalanx Attack Damage';
	this.canApply = function() {
		return this.getAtkInfo().attackType === 4;
	};
	
	this.adjustValue = function(dmg) {
		this.modPct = 60;
		this.result = dmg * 6 / 10;
	};
}

function AttackDmgPhalanxSp047(actList, actId) { // Enhanced Double ATK % (phalanx)
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	this.canApply = function() {
		return this.getAtkInfo().attackType === 4 && this.getAtkInfo().isDoubleAttack;
	};
	
	this.adjustValue = function(dmg) {
		this.modPct = this.getPassiveTotalVal();
		this.result = dmg * (100 + this.modPct) / 100;
	};
}

function AttackDmgPhalanxSp581(actList, actId) { // Quick Reflexes % (Phalanx)
	AttackAccActionBase.call(this, actList, actId, SIDE_DEF, 0);
	this.canApply = function() {
		return this.getAtkInfo().attackType === 4;
	};
	
	this.adjustValue = function(dmg) {
		this.modPct = this.getPassiveTotalVal();
		this.result = dmg - (dmg * this.modPct * 0.01);
	};
}

function AttackDmgPhalanxSp445(actList, actId) { // Oathkeeper (Phalanx)
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	this.canApply = function() {
		return this.getAtkInfo().attackType === 4;
	};
	
	this.adjustValue = function(dmg) {
		this.modPct = this.getPassiveTotalVal();
		this.result = dmg * (1 + this.modPct * 0.01);
	};
}

function AttackDmgSp585(actList, actId) { // Zhao Family Triple Strike
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	
	this.adjustValue = function(dmg) {
		this.modPct = this.getPassiveTotalVal();
		this.result = dmg * this.modPct * 0.01;
	};
}

function AttackDmgRandom(actList, actId) {
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 2, 0, 'int');
	this.displayName = "Random Damage";
	this.userText = 'Value';
	this.userValMin = -2;
	this.userValMax = 4;
	
	this.adjustValue = function(dmg) {
		this.modVal = this.userVal;
		this.result = dmg + this.modVal;
	};
}

function AttackDmgSp570(actList, actId) { // Wheel Upgrade %
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 1, 0, 'int');
	this.userText = 'Move Step';
	this.userValMax = 13;
	this.setUserVal = function(userVal) {
		this.userVal = userVal;
		this.actList.actionSp009.userVal = userVal; // change charge attack userVal too
	};
		
	this.adjustValue = function(dmg) {
		this.modPct = this.getPassiveTotalVal() * this.userVal;
		// if attacker has charge attack passive, delay calculation
		this.result = this.getAtkInfo().hasPassive(2200009) ? dmg : (dmg * (1 + this.modPct * 0.01));
	};
}

function AttackDmgSp009(actList, actId) { // % Charge Attack
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 1, 0, 'int');
	this.userText = 'Move Step';
	this.userValMax = 13;
	this.setUserVal = function(userVal) {
		this.userVal = userVal;
		this.actList.actionSp570.userVal = userVal; // change userVal userVal too
	};
		
	this.adjustValue = function(dmg) {
		this.modPct = this.getPassiveTotalVal() * this.userVal;
		var modPct = this.modPct;
		if (this.getAtkInfo().hasPassive(2200570))
			modPct += this.actList.actionSp570.modPct;
		this.result =  dmg * (1 + modPct * 0.01);
	};
}

function AttackDmgSp061(actList, actId) { // Critical Attack
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	this.needProcess = function() {
		return this.getAtkInfo().isCriticalAttack;
	};
	
	this.adjustValue = function(dmg) {
		this.modPct = 50;
		this.result = dmg * 1.5;
	};
}

function AttackDmgCriticalBonus(actList, actId) { // additional crit damage from luck diff
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	this.displayName = "Extra Critical Dmg from LCK";
	this.canApply = function() {
		return this.getAtkInfo().isCriticalAttack;
	};
	
	this.adjustValue = function(dmg) {
		var val = (this.getAtkInfo().attrs['lck'] - this.getDefInfo().attrs['lck']) / 4;
		this.modPct = Math.max(val, 0);
		this.result = dmg * (1 + this.modPct/100);
	};
}

function AttackDmgSp062(actList, actId) { // Critical Attack+
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	this.canApply = function() {
		return this.getAtkInfo().isCriticalAttack;
	};
	
	this.adjustValue = function(dmg) {
		this.modPct = this.getPassiveTotalVal();
		this.result = dmg * (1 + this.modPct/100);
	};
}

function AttackDmgSp060(actList, actId) { // Critical Attack Immunity (Attack)
	AttackAccActionBase.call(this, actList, actId, SIDE_DEF, 1, 1, 'bool');
	this.userText = 'Activated';
	this.canApply = function() {
		return this.getAtkInfo().attackType <= 1 && this.getAtkInfo().isCriticalAttack && !this.getDefInfo().hasPassive(2200027);
	};
	
	this.adjustValue = function(dmg) {
		this.modPct = (this.userVal) ? 100 : 0;
		this.result = (this.userVal) ? 0 : dmg;
	};
}

function AttackDmgSp027c(actList, actId) { // Special Attack Immunity (Critical)
	AttackAccActionBase.call(this, actList, actId, SIDE_DEF, 1, 1, 'bool');
	this.id = actId + 'c'; // overwrite id for unique id
	this.userText = 'Activated';
	this.canApply = function() {
		return this.getAtkInfo().attackType <= 1 && this.getAtkInfo().isCriticalAttack;
	};
	
	this.adjustValue = function(dmg) {
		this.modPct = (this.userVal) ? 100 : 0;
		this.result = (this.userVal) ? 0 : dmg;
	};
}

function AttackDmgSp017(actList, actId) { // Physical Certain Hit
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	this.adjustValue = function(dmg) {
		this.modPct = this.getAtkInfo().attackAccActionList.result;
		this.result = dmg * this.modPct * 0.01;
	};
}

function AttackDmgSp025(actList, actId) { // Double ATK Immunity
	AttackAccActionBase.call(this, actList, actId, SIDE_DEF, 1, 1, 'bool');
	this.userText = 'Activated';
	this.canApply = function() {
		return this.getAtkInfo().attackType === 0 && this.getAtkInfo().isDoubleAttack && !this.getDefInfo().hasPassive(2200027);
	};
	
	this.adjustValue = function(dmg) {
		this.modPct = (this.userVal) ? 100 : 0;
		this.result = (this.userVal) ? 0 : dmg;
	};
}

function AttackDmgSp027d(actList, actId) { // Special Attack Immunity (dobule)
	AttackAccActionBase.call(this, actList, actId, SIDE_DEF, 1, 1, 'bool');
	this.id = actId + 'd'; // overwrite id for unique id
	this.userText = 'Activated';
	this.canApply = function() {
		return this.getAtkInfo().attackType === 0 && this.getAtkInfo().isDoubleAttack;
	};
	
	this.adjustValue = function(dmg) {
		this.modPct = (this.userVal) ? 100 : 0;
		this.result = (this.userVal) ? 0 : dmg;
	};
}

function AttackDmgTech010(actList, actId) { // Research: Ambush
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	this.canApply = function() {
		var atkInfo = this.getAtkInfo();
		// all forest tile is 4200003, 4200044 (snow), 4200047 (peach), 4200051 (night)
		return atkInfo.allowItemTypes[0] === 2 && atkInfo.terrain === 4200003;
	};
	
	this.adjustValue = function(dmg) {
		this.modVal = 50;
		this.result = dmg + this.modVal;
	};
}

function AttackDmgTech023(actList, actId) { // Research: Exploit Weakness
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	this.canApply = function() {
		var weaponType = this.getAtkInfo().allowItemTypes[0];
		return weaponType === 3 && weaponType === 4;
	};
	
	this.adjustValue = function(dmg) {
		this.modVal = 10;
		this.result = dmg + this.modVal;
	};
}

function AttackDmgSp234(actList, actId) { // (Formation Effect) Enhanced Physical Attack
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	
	this.adjustValue = function(dmg) {
		this.modVal = this.getPassiveTotalVal();
		this.result = dmg + this.modVal;
	};
}

function AttackDmgSp242(actList, actId) { // (Formation Effect) Physical Damage Taken
	AttackAccActionBase.call(this, actList, actId, SIDE_DEF, 0);
	
	this.adjustValue = function(dmg) {
		this.modVal = this.getPassiveTotalVal();
		this.result = dmg + this.modVal;
	};
}

function AttackDmgSp237(actList, actId) { // (Formation Effect) Ranged Damage Dealt
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	this.canApply = function() {
		return this.getAtkInfo().attackRole === 'Range';
	};
	
	this.adjustValue = function(dmg) {
		this.modVal = this.getPassiveTotalVal();
		this.result = dmg + this.modVal;
	};
}

function AttackDmgSp245(actList, actId) { // (Formation Effect) Ranged Damage Taken
	AttackAccActionBase.call(this, actList, actId, SIDE_DEF, 0);
	this.canApply = function() {
		return this.getAtkInfo().attackRole === 'Range';
	};
	
	this.adjustValue = function(dmg) {
		this.modVal = this.getPassiveTotalVal();
		this.result = dmg + this.modVal;
	};
}

function AttackDmgSp236(actList, actId) { // (Formation Effect) Melee Damage Dealt
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	this.canApply = function() {
		return this.getAtkInfo().attackRole !== 'Range';
	};
	
	this.adjustValue = function(dmg) {
		this.modVal = this.getPassiveTotalVal();
		this.result = dmg + this.modVal;
	};
}

function AttackDmgSp240(actList, actId) { // (Formation Effect) Mounted Damage Dealt
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	this.canApply = function() {
		return isCavalryUnit(this.getDefInfo().unit.jobTypeId);
	};
	
	this.adjustValue = function(dmg) {
		this.modVal = this.getPassiveTotalVal();
		this.result = dmg + this.modVal;
	};
}

function AttackDmgSp411(actList, actId) { // Enhanced Physical Attack
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	
	this.adjustValue = function(dmg) {
		this.modVal = this.getPassiveTotalVal();
		this.result = dmg + this.modVal;
	};
}

function AttackDmgSp496(actList, actId) { // Relic: Melee Attack +
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	this.canApply = function() {
		return this.getAtkInfo().attackRole !== 'Range';
	};
	
	this.adjustValue = function(dmg) {
		this.modVal = this.getPassiveTotalVal();
		this.result = dmg + this.modVal;
	};
}

function AttackDmgSp497(actList, actId) { // Relic: Ranged Attack +
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	this.canApply = function() {
		return this.getAtkInfo().attackRole === 'Range';
	};
	
	this.adjustValue = function(dmg) {
		this.modVal = this.getPassiveTotalVal();
		this.result = dmg + this.modVal;
	};
}

function AttackDmgSp266(actList, actId) { // Attack Damage %
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	
	this.adjustValue = function(dmg) {
		this.modVal = this.getPassiveTotalVal();
		this.result = dmg + this.modVal;
	};
}

function AttackDmgSp267(actList, actId) { // Status Effect Attack Damage %
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	
	this.adjustValue = function(dmg) {
		this.modVal = this.getPassiveTotalVal();
		this.result = dmg + this.modVal;
	};
}

function AttackDmgSp268(actList, actId) { // Absorb Attack Damage %
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	
	this.adjustValue = function(dmg) {
		this.modVal = this.getPassiveTotalVal();
		this.result = dmg + this.modVal;
	};
}

function AttackDmgSp272(actList, actId) { // Max Damage Defense %
	AttackAccActionBase.call(this, actList, actId, SIDE_DEF, 0);
	
	this.adjustValue = function(dmg) {
		this.modPct = this.getPassiveTotalVal();
		this.result = (this.modPct === 0) ? dmg : Math.min(dmg, this.getDefInfo().hpMax * this.modPct / 100);
	};
}

function AttackDmgSp418(actList, actId) { // Deadly Attack
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 0);
	this.canApply = function() {
		return !this.getAtkInfo().hasPassive(2200585); // Zhao Family Triple Strike
	}
	
	this.adjustValue = function(dmg) {
		this.modPct = this.getPassiveTotalVal();
		this.result = dmg * (1 + this.modPct / 100);
	};
}

function AttackDmgSp101(actList, actId) { // Desperate Attack
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 2, 1, 'int');
	this.userText = 'Attack Order'; // TODO: better user text (maybe it is target hit (included joint/...))
	this.userValMin = 1;
	this.canApply = function() {
		return this.getAtkInfo().attackType === 7;
	};
	
	this.adjustValue = function(dmg) {
		this.modPct = -(this.userVal-1) * this.getPassiveTotalVal();
		this.result = dmg + (dmg * this.modPct / 100);
	};
}

function AttackDmgSp415(actList, actId) { // Guard
	AttackAccActionBase.call(this, actList, actId, SIDE_DEF, 1, 0, 'bool');
	this.userText = 'Activated';
	this.canApply = function() {
		return !this.getAtkInfo().isAoEAttack();
	}
	
	this.adjustValue = function(dmg) {
		if (this.userVal) {
			this.modPct = this.getPassiveTotalVal();
			this.result = dmg * (100 - this.modPct) / 100;
		}
		else {
			this.modPct = 0;
			this.result = dmg;
		}
	};
}

function AttackDmgSp421(actList, actId) { // Song: Physical Damage -%
	AttackAccActionBase.call(this, actList, actId, SIDE_DEF, 2, 0, 'bool');
	this.userText = 'In Song Aura';
	
	this.adjustValue = function(dmg) {
		if (this.userVal) {
			this.modPct = 25;
			this.result = dmg - dmg * this.modPct / 100;
		}
		else {
			this.modPct = 0;
			this.result = dmg;
		}
	};
}

function AttackDmgSp542(actList, actId) { // Fire Attack % (main target only)
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 1, 1, 'bool');
	this._userText = 'Main Target';
	this.canApply = function() {
		// if not aoe, no need to ask
		if (this.getAtkInfo().isAoEAttack()) {
			this.userText = this._userText;
		}
		else {
			delete this.userText;
			this.userVal = 1;
		}
		return true;
	};

	
	this.adjustValue = function(dmg) {
		if (this.userVal) {
			this.modVal = this.getPassiveTotalVal();
			this.result = dmg + this.modVal;
		}
		else {
			this.modPct = 0;
			this.result = dmg;
		}
	};
}

function AttackDmgPatience(actList, actId) { // swift calvary Patience tactic
	AttackAccActionBase.call(this, actList, actId, SIDE_DEF, 2, 0, 'bool');
	this.displayName = _findObj(2000170, tactics).name;
	this.userText = 'Activated';
	this.canApply = function() {
		return this.getDefInfo().unit.jobTypeId === 1210078;
	};
	
	this.adjustValue = function(dmg) {
		if (this.userVal) {
			this.modPct = 20;
			this.result = dmg - dmg * this.modPct / 100;
		}
		else {
			this.modPct = 0;
			this.result = dmg;
		}
	};
}

function AttackDmgComposure(actList, actId) { // swift calvary Tranquility tactic
	AttackAccActionBase.call(this, actList, actId, SIDE_DEF, 2, 0, 'bool');
	this.displayName = _findObj(2000171, tactics).name;
	this.userText = 'Activated';
	this.canApply = function() {
		return this.getDefInfo().unit.jobTypeId === 1210078;
	};
	
	this.adjustValue = function(dmg) {
		if (this.userVal) {
			this.modPct = 20;
			this.result = dmg + dmg * this.modPct / 100;
		}
		else {
			this.modPct = 0;
			this.result = dmg;
		}
	};
}

function AttackDmgSp443(actList, actId) { // Overwhelm
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 1, 1, 'bool');
	this._userText = 'Main Target';
	this.canApply = function() {
		// if not aoe, no need to ask
		if (this.getAtkInfo().isAoEAttack()) {
			this.userText = this._userText;
		}
		else {
			delete this.userText;
			this.userVal = 1;
		}
		return true;
	};
	
	this.adjustValue = function(dmg) {
		if (this.userVal) {
			var val = (this.getAtkInfo().attrs.str - this.getDefInfo().attrs.str) / 2;
			this.modPct = mathClamp(val, 0, this.getPassiveTotalVal());
			this.result = dmg * (1 + this.modPct * 0.01);
		}
		else {
			this.modPct = 0;
			this.result = dmg;
		}
	};
}

function AttackDmgSp543(actList, actId) { // Mortal Blaze (assume main target)
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 1, 0, 'int');
	this.userText = 'Count';
	this.userValMax = 8;
	
	this.setUserVal = function(val) {
		this.userVal = val;
		this.actList.actionFlameMark.userVal = (val < 2) ? val : 0;
	};
	
	this.adjustValue = function(dmg) {
		if (this.userVal < 2) {
			this.modPct = 0;
			this.result = dmg;
		}
		else {
			this.modPct = this.getPassiveTotalVal() * this.userVal;
			var cap = this.getAtkInfo().getStat('atk') * 0.01 * this.userVal;
			var val = dmg * this.modPct / 100;
			this.result = Math.max(0, dmg + Math.min(val, cap));
		}
	};
}

function AttackDmgFlameMark(actList, actId) {
	AttackAccActionBase.call(this, actList, actId, SIDE_DEF, 2, 0, 'int');
	this.displayName = 'Flame Mark';
	this.userText = 'Count';
	this.userValMax = 8;
	this.markPct = [ 0, 3, 5, 7, 10, 15, 20, 27, 35 ];
	
	this.setUserVal = function(val) {
		if (this.getAtkInfo().hasPassive(2200543)) {
			this.actList.actionSp543.userVal = val;
			this.userVal = (val < 2) ? val : 0;
		}
		else {
			this.val = val;
		}
	};
	
	this.adjustValue = function(dmg) {
		this.modPct = this.markPct[this.userVal];
		this.result = dmg + (dmg * this.modPct / 100);
	};
}

function AttackDmgSp570e(actList, actId) { // wheel upgrade (non-main target)
	AttackAccActionBase.call(this, actList, actId, SIDE_ATK, 1, 1, 'bool');
	this.id = actId+'e';
	this.userText = 'Main Target';
	
	this.adjustValue = function(dmg) {
		if (this.userVal) {
			this.modPct = 0;
			this.result = dmg;
		}
		else {
			this.modPct = 50;
			this.result = dmg * 0.5;
		}
	};
}
