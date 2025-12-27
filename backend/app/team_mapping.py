"""Team mapping system for accurate professional team identification."""

from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from app.logging_utils import get_logger

logger = get_logger(__name__)

@dataclass
class TeamInfo:
    """Professional team information."""
    name: str
    team_id: str
    region: str
    rank: int
    is_professional: bool = True
    earnings: str = "$0"
    record: str = "0-0"
    priority: int = 1  # 1 = highest priority, 5 = lowest

class TeamMapper:
    """Maps team names to professional team information."""
    
    def __init__(self):
        self.professional_teams = self._build_professional_team_database()
        self.name_aliases = self._build_name_aliases()
        
    def _build_professional_team_database(self) -> Dict[str, TeamInfo]:
        """Build database of professional teams with their correct information."""
        return {
            # AP Region - Top Teams
            "paper_rex": TeamInfo("Paper Rex", "paper_rex", "AP", 1, True, "$1,626,136", "52–24", 1),
            "motiv_esports": TeamInfo("Motiv Esports", "motiv_esports", "AP", 2, True, "$103,287", "40–15", 1),
            "full_sense": TeamInfo("FULL SENSE", "full_sense", "AP", 3, True, "$126,781", "41–16", 1),
            "rex_regum_qeon": TeamInfo("Rex Regum Qeon", "rex_regum_qeon", "AP", 4, True, "$143,125", "25–22", 1),
            "velocity_gaming": TeamInfo("Velocity Gaming", "velocity_gaming", "AP", 5, True, "$74,896", "22–2", 1),
            "talon": TeamInfo("TALON", "talon", "AP", 6, True, "$104,054", "22–27", 1),
            "naos": TeamInfo("NAOS", "naos", "AP", 7, True, "$29,000", "14–9", 1),
            "fancy_united_esports": TeamInfo("Fancy United Esports", "fancy_united_esports", "AP", 8, True, "$87,480", "27–12", 1),
            "team_nkt": TeamInfo("Team NKT", "team_nkt", "AP", 9, True, "$15,647", "26–8", 1),
            "revenant_xspark": TeamInfo("Revenant XSpark", "revenant_xspark", "AP", 10, True, "$199,489", "36–14", 1),
            "boom_esports": TeamInfo("BOOM Esports", "boom_esports", "AP", 11, True, "$174,157", "32–18", 1),
            
            # CN Region - Top Teams
            "bilibili_gaming": TeamInfo("Bilibili Gaming", "bilibili_gaming", "CN", 1, True, "$139,124", "31–27", 1),
            "edward_gaming": TeamInfo("EDward Gaming", "edward_gaming", "CN", 2, True, "$1,354,562", "46–28", 1),
            "xi_lai_gaming": TeamInfo("Xi Lai Gaming", "xi_lai_gaming", "CN", 3, True, "$86,458", "34–21", 1),
            "dragon_ranger_gaming": TeamInfo("Dragon Ranger Gaming", "dragon_ranger_gaming", "CN", 4, True, "$17,835", "20–25", 1),
            "wolves_esports": TeamInfo("Wolves Esports", "wolves_esports", "CN", 5, True, "$129,928", "31–26", 1),
            "trace_esports": TeamInfo("Trace Esports", "trace_esports", "CN", 6, True, "$89,713", "30–28", 1),
            "rare_atom": TeamInfo("Rare Atom", "rare_atom", "CN", 7, True, "$0", "4–1", 1),
            "chosen_clique_gaming": TeamInfo("Chosen Clique Gaming", "chosen_clique_gaming", "CN", 8, True, "$4,121", "4–2", 1),
            "jdg_esports": TeamInfo("JDG Esports", "jdg_esports", "CN", 9, True, "$24,028", "16–25", 1),
            "keepbest_gaming": TeamInfo("KeepBest Gaming", "keepbest_gaming", "CN", 10, True, "$11,402", "4–2", 1),
            
            # EU Region - Top Teams
            "fnatic": TeamInfo("FNATIC", "fnatic", "EU", 1, True, "$1,782,285", "44–21", 1),
            "team_heretics": TeamInfo("Team Heretics", "team_heretics", "EU", 2, True, "$1,240,000", "44–23", 1),
            "mouz": TeamInfo("MOUZ", "mouz", "EU", 3, True, "$42,597", "44–14", 1),
            "team_liquid": TeamInfo("Team Liquid", "team_liquid", "EU", 4, True, "$183,750", "22–13", 1),
            "bbl_pcific": TeamInfo("BBL PCIFIC", "bbl_pcific", "EU", 5, True, "$35,091", "74–20", 1),
            "enterprise_esports": TeamInfo("Enterprise Esports", "enterprise_esports", "EU", 6, True, "$16,871", "26–8", 1),
            "bbl_esports": TeamInfo("BBL Esports", "bbl_esports", "EU", 7, True, "$122,500", "26–12", 1),
            "ulf_esports": TeamInfo("ULF Esports", "ulf_esports", "EU", 8, True, "$8,403", "27–17", 1),
            "giantx": TeamInfo("GIANTX", "giantx", "EU", 9, True, "$75,000", "11–13", 1),
            "karmine_corp": TeamInfo("Karmine Corp", "karmine_corp", "EU", 10, True, "$40,000", "14–14", 1),
            
            # JP Region - Top Teams
            "riddle_order": TeamInfo("RIDDLE ORDER", "riddle_order", "JP", 1, True, "$64,086", "39–8", 1),
            "fennel": TeamInfo("FENNEL", "fennel", "JP", 2, True, "$27,664", "21–9", 1),
            "zeta_division": TeamInfo("ZETA DIVISION", "zeta_division", "JP", 3, True, "$42,268", "19–18", 1),
            "noez_foxx": TeamInfo("NOEZ FOXX", "noez_foxx", "JP", 4, True, "$13,495", "24–11", 1),
            "delight": TeamInfo("Delight", "delight", "JP", 5, True, "$3,373", "17–11", 1),
            "detonation_focusme": TeamInfo("DetonatioN FocusMe", "detonation_focusme", "JP", 6, True, "$0", "11–15", 1),
            "crest_gaming_zst": TeamInfo("CREST GAMING Zst", "crest_gaming_zst", "JP", 7, True, "$11,200", "21–13", 1),
            "qt_dig∞": TeamInfo("QT DIG∞", "qt_dig∞", "JP", 8, True, "$18,388", "29–22", 1),
            "scarz": TeamInfo("SCARZ", "scarz", "JP", 9, True, "$675", "7–4", 1),
            "reject": TeamInfo("REJECT", "reject", "JP", 10, True, "$3,375", "4–5", 1),
            
            # KR Region - Top Teams
            "geng": TeamInfo("Gen.G", "geng", "KR", 1, True, "$807,080", "51–26", 1),
            "t1": TeamInfo("T1", "t1", "KR", 2, True, "$287,678", "27–15", 1),
            "drx": TeamInfo("DRX", "drx", "KR", 3, True, "$174,321", "30–17", 1),
            "nongshim_redforce": TeamInfo("Nongshim RedForce", "nongshim_redforce", "KR", 4, True, "$50,496", "27–11", 1),
            "t1_academy": TeamInfo("T1 Academy", "t1_academy", "KR", 5, True, "$54,699", "24–8", 1),
            "slt_seongnam": TeamInfo("SLT Seongnam", "slt_seongnam", "KR", 6, True, "$18,743", "28–16", 1),
            "fearx": TeamInfo("FEARX", "fearx", "KR", 7, True, "$53,081", "45–19", 1),
            "onside_gaming": TeamInfo("ONSIDE GAMING", "onside_gaming", "KR", 8, True, "$6,472", "12–18", 1),
            "cnj_esports": TeamInfo("CNJ Esports", "cnj_esports", "KR", 9, True, "$0", "0–0", 1),
            "oly": TeamInfo("OLY", "oly", "KR", 10, True, "$0", "0–0", 1),
            
            # MN Region - Top Teams
            "twisted_minds": TeamInfo("Twisted Minds", "twisted_minds", "MN", 1, True, "$30,991", "31–10", 1),
            "team_raad": TeamInfo("Team RA'AD", "team_raad", "MN", 2, True, "$114,261", "33–13", 1),
            "the_ultimates": TeamInfo("The Ultimates", "the_ultimates", "MN", 3, True, "$270,949", "90–21", 1),
            "alqadsiah_esports": TeamInfo("AlQadsiah Esports", "alqadsiah_esports", "MN", 4, True, "$53,586", "30–18", 1),
            "gamax_esports": TeamInfo("Gamax Esports", "gamax_esports", "MN", 5, True, "$5,900", "10–6", 1),
            "nobles": TeamInfo("NOBLES", "nobles", "MN", 6, True, "$8,666", "13–9", 1),
            "stallions_esports": TeamInfo("Stallions Esports", "stallions_esports", "MN", 7, True, "$3,998", "8–8", 1),
            "baam_esports": TeamInfo("BAAM Esports", "baam_esports", "MN", 8, True, "$5,000", "8–7", 1),
            "elso7ba": TeamInfo("Elso7ba", "elso7ba", "MN", 9, True, "$1,500", "4–1", 1),
            "3bl_esports": TeamInfo("3BL Esports", "3bl_esports", "MN", 10, True, "$2,988", "8–5", 1),
            
            # NA Region - Top Teams
            "g2_esports": TeamInfo("G2 Esports", "g2_esports", "NA", 1, True, "$697,250", "50–21", 1),
            "nrg": TeamInfo("NRG", "nrg", "NA", 2, True, "$1,000,500", "30–18", 1),
            "sentinels": TeamInfo("Sentinels", "sentinels", "NA", 3, True, "$588,000", "42–26", 1),
            "envy": TeamInfo("ENVY", "envy", "NA", 4, True, "$48,000", "35–5", 1),
            "tsm": TeamInfo("TSM", "tsm", "NA", 5, True, "$212,750", "46–30", 1),
            "cloud9": TeamInfo("Cloud9", "cloud9", "NA", 6, True, "$259,143", "22–22", 1),
            "qor": TeamInfo("QoR", "qor", "NA", 7, True, "$9,200", "40–9", 1),
            "cubert_academy": TeamInfo("Cubert Academy", "cubert_academy", "NA", 8, True, "$7,250", "18–9", 1),
            "100_thieves": TeamInfo("100 Thieves", "100_thieves", "NA", 9, True, "$240,500", "26–23", 1),
            "maryville_university": TeamInfo("Maryville University", "maryville_university", "NA", 10, True, "$26,675", "63–24", 1),
            
            # OCE Region - Top Teams
            "e_king": TeamInfo("E-KING", "e_king", "OCE", 1, True, "$62,702", "47–9", 1),
            "full_house": TeamInfo("Full House", "full_house", "OCE", 2, True, "$3,846", "19–3", 1),
            "bobo": TeamInfo("BOBO", "bobo", "OCE", 3, True, "$2,152", "26–16", 1),
            "vina_side_hustle": TeamInfo("VINA SIDE HUSTLE", "vina_side_hustle", "OCE", 4, True, "$1,136", "12–9", 1),
            "og": TeamInfo("OG", "og", "OCE", 5, True, "$326", "8–3", 1),
            "get_a_job": TeamInfo("Get A Job", "get_a_job", "OCE", 6, True, "$2,891", "24–19", 1),
            "care_mid": TeamInfo("Care Mid", "care_mid", "OCE", 7, True, "$163", "9–7", 1),
            "peace_and_love": TeamInfo("Peace And Love", "peace_and_love", "OCE", 8, True, "$0", "7–5", 1),
            "edge": TeamInfo("EDGE", "edge", "OCE", 9, True, "$0", "6–4", 1),
            "xyz": TeamInfo("xyz", "xyz", "OCE", 10, True, "$158", "12–8", 1),
        }
    
    def _build_name_aliases(self) -> Dict[str, str]:
        """Build aliases for common team name variations."""
        return {
            # Paper Rex aliases
            "paper rex": "paper_rex",
            "paperrex": "paper_rex",
            "prx": "paper_rex",
            
            # Gen.G aliases
            "gen.g": "geng",
            "gen g": "geng",
            "geng": "geng",
            
            # T1 aliases
            "t1": "t1",
            "t1 esports": "t1",
            
            # FNATIC aliases
            "fnatic": "fnatic",
            "fnc": "fnatic",
            
            # G2 aliases
            "g2": "g2_esports",
            "g2 esports": "g2_esports",
            
            # NRG aliases
            "nrg": "nrg",
            "nrg esports": "nrg",
            
            # Sentinels aliases
            "sentinels": "sentinels",
            "sen": "sentinels",
            "sentinels esports": "sentinels",
            
            # Team Liquid aliases
            "team liquid": "team_liquid",
            "liquid": "team_liquid",
            "tl": "team_liquid",
            
            # Cloud9 aliases
            "cloud9": "cloud9",
            "c9": "cloud9",
            
            # 100 Thieves aliases
            "100 thieves": "100_thieves",
            "100t": "100_thieves",
            "100t esports": "100_thieves",
            
            # TSM aliases
            "tsm": "tsm",
            "tsm esports": "tsm",
            
            # DRX aliases
            "drx": "drx",
            "drx esports": "drx",
            
            # EDward Gaming aliases
            "edward gaming": "edward_gaming",
            "edg": "edward_gaming",
            "edward": "edward_gaming",
            
            # Bilibili Gaming aliases
            "bilibili gaming": "bilibili_gaming",
            "blg": "bilibili_gaming",
            "bilibili": "bilibili_gaming",
        }
    
    def find_team(self, search_term: str) -> Optional[TeamInfo]:
        """Find a professional team by name or alias."""
        search_term = search_term.lower().strip()
        
        # First try exact match
        if search_term in self.professional_teams:
            return self.professional_teams[search_term]
        
        # Try aliases
        if search_term in self.name_aliases:
            team_id = self.name_aliases[search_term]
            return self.professional_teams.get(team_id)
        
        # Try partial matches
        for team_id, team_info in self.professional_teams.items():
            if search_term in team_info.name.lower() or search_term in team_id.lower():
                return team_info
        
        return None
    
    def get_professional_teams(self, region: Optional[str] = None, limit: int = 20) -> List[TeamInfo]:
        """Get list of professional teams, optionally filtered by region."""
        teams = list(self.professional_teams.values())
        
        if region:
            teams = [team for team in teams if team.region.upper() == region.upper()]
        
        # Sort by rank within region
        teams.sort(key=lambda x: (x.region, x.rank))
        
        return teams[:limit]
    
    def is_professional_team(self, team_id: str) -> bool:
        """Check if a team ID belongs to a professional team."""
        return team_id in self.professional_teams
    
    def get_team_by_id(self, team_id: str) -> Optional[TeamInfo]:
        """Get team information by team ID."""
        return self.professional_teams.get(team_id)
    
    def filter_professional_teams(self, teams_data: List[Dict]) -> List[Dict]:
        """Filter API response to only include professional teams."""
        professional_teams = []
        
        for team_data in teams_data:
            team_id = team_data.get('team_id', '')
            team_name = team_data.get('team', '')
            
            # Check if this is a professional team
            if self.is_professional_team(team_id):
                professional_teams.append(team_data)
                logger.debug(f"Included professional team: {team_name} ({team_id})")
            else:
                # Check for meme teams to exclude
                if any(meme_indicator in team_name.lower() for meme_indicator in [
                    'we have', 'at home', 'meme', 'joke', 'fake', 'test', 'demo'
                ]):
                    logger.debug(f"Excluded meme team: {team_name} ({team_id})")
                    continue
                
                # Include if it has decent earnings or record
                earnings = team_data.get('earnings', '$0')
                record = team_data.get('record', '0-0')
                
                # Parse earnings (remove $ and commas)
                try:
                    earnings_value = float(earnings.replace('$', '').replace(',', ''))
                    if earnings_value > 1000:  # More than $1000 in earnings
                        professional_teams.append(team_data)
                        logger.debug(f"Included team with earnings: {team_name} ({team_id}) - ${earnings_value}")
                        continue
                except:
                    pass
                
                # Parse record (wins-losses)
                try:
                    if '–' in record:
                        wins, losses = record.split('–')
                        wins, losses = int(wins), int(losses)
                        if wins + losses >= 10:  # At least 10 matches played
                            professional_teams.append(team_data)
                            logger.debug(f"Included team with record: {team_name} ({team_id}) - {record}")
                            continue
                except:
                    pass
        
        return professional_teams

# Global team mapper instance
team_mapper = TeamMapper()
