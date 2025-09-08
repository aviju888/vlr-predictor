// VLR Predictor Frontend
class VLRPredictor {
    constructor() {
        this.apiBase = 'http://127.0.0.1:8000';
        this.teams = [];
        this.init();
    }

    async init() {
        await this.loadTeams();
        this.setupEventListeners();
        this.populateTeamDropdowns();
    }

    async loadTeams() {
        try {
            this.showLoading(true);
            
            // Load professional teams only from our API
            const response = await fetch(`${this.apiBase}/teams/rankings?professional_only=true&limit=50&_t=${Date.now()}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            this.teams = data.teams || [];
            
            console.log(`Loaded ${this.teams.length} professional teams from ${data.regions?.length || 0} regions`);
            console.log('Sample professional teams:', this.teams.slice(0, 5));
            
        } catch (error) {
            console.error('Failed to load teams:', error);
            this.showError('Failed to load team data. Please check if the API server is running.');
        } finally {
            this.showLoading(false);
        }
    }

    populateTeamDropdowns() {
        const team1Select = document.getElementById('team1');
        const team2Select = document.getElementById('team2');
        
        // Clear existing options
        team1Select.innerHTML = '<option value="">Select Team 1</option>';
        team2Select.innerHTML = '<option value="">Select Team 2</option>';
        
        // Sort teams by rank (lower rank number = better team)
        const sortedTeams = [...this.teams].sort((a, b) => {
            const rankA = parseInt(a.rank) || 999;
            const rankB = parseInt(b.rank) || 999;
            return rankA - rankB;
        });
        
        // Group teams by region
        const teamsByRegion = {};
        sortedTeams.forEach(team => {
            if (!teamsByRegion[team.region]) {
                teamsByRegion[team.region] = [];
            }
            teamsByRegion[team.region].push(team);
        });
        
        // Add teams grouped by region (prioritize better teams)
        Object.keys(teamsByRegion).sort().forEach(region => {
            const regionTeams = teamsByRegion[region];
            
            // Add region header to team1
            const optgroup1 = document.createElement('optgroup');
            optgroup1.label = `${region} (${regionTeams.length} teams)`;
            team1Select.appendChild(optgroup1);
            
            // Add region header to team2
            const optgroup2 = document.createElement('optgroup');
            optgroup2.label = `${region} (${regionTeams.length} teams)`;
            team2Select.appendChild(optgroup2);
            
            regionTeams.forEach(team => {
                const option1 = document.createElement('option');
                option1.value = team.team_id;
                option1.textContent = `${team.team} (${team.region}, #${team.rank})`;
                option1.dataset.team = JSON.stringify(team);
                optgroup1.appendChild(option1);
                
                const option2 = document.createElement('option');
                option2.value = team.team_id;
                option2.textContent = `${team.team} (${team.region}, #${team.rank})`;
                option2.dataset.team = JSON.stringify(team);
                optgroup2.appendChild(option2);
            });
        });
    }

    setupEventListeners() {
        // Team selection change
        document.getElementById('team1').addEventListener('change', (e) => {
            this.handleTeamSelection(e, 'team1');
        });
        
        document.getElementById('team2').addEventListener('change', (e) => {
            this.handleTeamSelection(e, 'team2');
        });
        
        // Team search functionality
        document.getElementById('team1-search').addEventListener('input', (e) => {
            this.filterTeams('team1', e.target.value);
        });
        
        document.getElementById('team2-search').addEventListener('input', (e) => {
            this.filterTeams('team2', e.target.value);
        });
        
        // Prediction button
        document.getElementById('predict-btn').addEventListener('click', () => {
            this.makePrediction();
        });
    }

    async filterTeams(teamNumber, searchTerm) {
        const select = document.getElementById(teamNumber);
        const options = select.querySelectorAll('option');
        
        // If search term is long enough, try API search for better results
        if (searchTerm.length >= 3) {
            try {
                const response = await fetch(`${this.apiBase}/teams/search?query=${encodeURIComponent(searchTerm)}&limit=10&_t=${Date.now()}`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.teams && data.teams.length > 0) {
                        // Clear current options except placeholder
                        select.innerHTML = '<option value="">Select Team</option>';
                        
                        // Add search results
                        data.teams.forEach(team => {
                            const option = document.createElement('option');
                            option.value = team.team_id;
                            option.textContent = `${team.team} (${team.region}, #${team.rank})`;
                            option.dataset.team = JSON.stringify(team);
                            select.appendChild(option);
                        });
                        
                        // If only one result, auto-select it
                        if (data.teams.length === 1) {
                            select.value = data.teams[0].team_id;
                            this.handleTeamSelection({ target: { selectedOptions: [select.options[1]] } }, teamNumber);
                        }
                        return;
                    }
                }
            } catch (error) {
                console.warn('API search failed, falling back to local filtering:', error);
            }
        }
        
        // Fallback to local filtering
        options.forEach(option => {
            if (option.value === '') {
                option.style.display = 'block'; // Always show placeholder
                return;
            }
            
            const teamName = option.textContent.toLowerCase();
            const search = searchTerm.toLowerCase();
            
            if (teamName.includes(search)) {
                option.style.display = 'block';
            } else {
                option.style.display = 'none';
            }
        });
        
        // If search term matches exactly one team, select it
        if (searchTerm.length > 2) {
            const exactMatches = Array.from(options).filter(option => 
                option.value !== '' && 
                option.textContent.toLowerCase().includes(searchTerm.toLowerCase())
            );
            
            if (exactMatches.length === 1) {
                select.value = exactMatches[0].value;
                this.handleTeamSelection({ target: { selectedOptions: [exactMatches[0]] } }, teamNumber);
            }
        }
    }

    handleTeamSelection(event, teamNumber) {
        const selectedOption = event.target.selectedOptions[0];
        const teamInfo = document.getElementById(`${teamNumber}-info`);
        
        if (selectedOption && selectedOption.dataset.team) {
            const team = JSON.parse(selectedOption.dataset.team);
            teamInfo.innerHTML = `
                <h3>${team.team}</h3>
                <p><strong>Region:</strong> ${team.region}</p>
                <p><strong>Rank:</strong> #${team.rank}</p>
                <p><strong>Record:</strong> ${team.record}</p>
                <p><strong>Earnings:</strong> ${team.earnings}</p>
                <p><strong>Last Played:</strong> ${team.last_played}</p>
            `;
            teamInfo.classList.add('show');
        } else {
            teamInfo.classList.remove('show');
        }
    }

    async makePrediction() {
        const team1Id = document.getElementById('team1').value;
        const team2Id = document.getElementById('team2').value;
        const mapName = document.getElementById('map-select').value;
        const modelType = document.getElementById('model-select').value;
        
        if (!team1Id || !team2Id) {
            this.showError('Please select both teams before making a prediction.');
            return;
        }
        
        if (team1Id === team2Id) {
            this.showError('Please select different teams.');
            return;
        }
        
        try {
            this.showLoading(true);
            
            // Determine API endpoint based on model type
            let endpoint = '/predictions/predict';
            if (modelType === 'enhanced') {
                endpoint = '/predictions/predict/enhanced';
            } else if (modelType === 'sos') {
                endpoint = '/predictions/predict/sos';
            } else if (modelType === 'trained') {
                endpoint = '/predictions/predict/trained';
            }
            
            // Add map parameter if specified
            const url = new URL(`${this.apiBase}${endpoint}`);
            if (mapName) {
                url.searchParams.append('map_name', mapName);
            }
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    team1_id: team1Id,
                    team2_id: team2Id
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const prediction = await response.json();
            this.displayPrediction(prediction);
            
            // Load additional data
            await this.loadHeadToHead(team1Id, team2Id);
            await this.loadTeamForm(team1Id, team2Id);
            
        } catch (error) {
            console.error('Prediction failed:', error);
            this.showError('Failed to make prediction. Please check if the API server is running.');
        } finally {
            this.showLoading(false);
        }
    }

    displayPrediction(prediction) {
        const resultsSection = document.getElementById('results-section');
        const resultsDiv = document.getElementById('prediction-results');
        
        const team1Stats = prediction.team1_stats;
        const team2Stats = prediction.team2_stats;
        
        const team1Wins = prediction.predicted_winner === team1Stats.team_name;
        const team2Wins = prediction.predicted_winner === team2Stats.team_name;
        
        // Check if this is a SOS prediction with additional info
        const sosInfo = prediction.additional_info?.strength_of_schedule;
        const isSOSPrediction = prediction.model_version?.includes('sos') || sosInfo;
        
        // Build stats display for each team
        const buildTeamStats = (stats, sosData = null) => {
            let statsHtml = `
                <div class="stats">
                    <p>ACS: ${stats.avg_acs}</p>
                    <p>K/D: ${stats.avg_kd}</p>
                    <p>Rating: ${stats.avg_rating}</p>
                    <p>Win Rate: ${(stats.win_rate * 100).toFixed(1)}%</p>
            `;
            
            if (sosData) {
                statsHtml += `
                    <div class="sos-info" style="margin-top: 10px; padding: 8px; background: #f7fafc; border-radius: 4px; font-size: 0.85rem;">
                        <p><strong>Rank:</strong> #${sosData.original_rank}</p>
                        <p><strong>SOS Multiplier:</strong> ${sosData.sos_multiplier}x</p>
                        <p><strong>Adjusted Stats:</strong></p>
                        <p style="margin-left: 10px;">ACS: ${sosData.adjusted_stats.avg_acs}</p>
                        <p style="margin-left: 10px;">K/D: ${sosData.adjusted_stats.avg_kd}</p>
                        <p style="margin-left: 10px;">Rating: ${sosData.adjusted_stats.avg_rating}</p>
                    </div>
                `;
            }
            
            statsHtml += `</div>`;
            return statsHtml;
        };
        
        resultsDiv.innerHTML = `
            <div class="prediction-card fade-in">
                <div class="prediction-header">
                    <div class="prediction-winner">${prediction.predicted_winner}</div>
                    <div class="prediction-confidence">${(prediction.confidence * 100).toFixed(1)}% Confidence</div>
                </div>
                
                ${isSOSPrediction ? `
                    <div class="sos-explanation" style="background: #e6fffa; border: 1px solid #4fd1c7; border-radius: 8px; padding: 12px; margin: 10px 0; font-size: 0.9rem;">
                        <strong>Strength of Schedule Analysis:</strong> This prediction adjusts team stats based on the quality of opponents they've faced. 
                        Teams with higher SOS multipliers have played against stronger competition.
                    </div>
                ` : ''}
                
                <div class="prediction-details">
                    <div class="team-prediction ${team1Wins ? 'winner' : ''}">
                        <h3>${team1Stats.team_name}</h3>
                        <div class="probability">${(prediction.team1_win_probability * 100).toFixed(1)}%</div>
                        ${buildTeamStats(team1Stats, sosInfo?.team1)}
                    </div>
                    
                    <div class="vs-center">
                        <div>VS</div>
                        <div style="font-size: 0.9rem; color: #718096;">${prediction.model_version}</div>
                    </div>
                    
                    <div class="team-prediction ${team2Wins ? 'winner' : ''}">
                        <h3>${team2Stats.team_name}</h3>
                        <div class="probability">${(prediction.team2_win_probability * 100).toFixed(1)}%</div>
                        ${buildTeamStats(team2Stats, sosInfo?.team2)}
                    </div>
                </div>
            </div>
        `;
        
        resultsSection.style.display = 'block';
        resultsSection.scrollIntoView({ behavior: 'smooth' });
    }

    async loadHeadToHead(team1Id, team2Id) {
        try {
            // Get team names from the selected options
            const team1Name = this.getTeamName(team1Id);
            const team2Name = this.getTeamName(team2Id);
            
            if (!team1Name || !team2Name) return;
            
            const response = await fetch(`${this.apiBase}/predictions/history/h2h/${encodeURIComponent(team1Name)}/${encodeURIComponent(team2Name)}`);
            const data = await response.json();
            
            if (data.success) {
                this.displayHeadToHead(data.head_to_head, team1Name, team2Name);
            }
        } catch (error) {
            console.warn('Failed to load head-to-head data:', error);
        }
    }

    async loadTeamForm(team1Id, team2Id) {
        try {
            const team1Name = this.getTeamName(team1Id);
            const team2Name = this.getTeamName(team2Id);
            
            if (!team1Name || !team2Name) return;
            
            const [team1Form, team2Form] = await Promise.all([
                fetch(`${this.apiBase}/predictions/history/form/${encodeURIComponent(team1Name)}`).then(r => r.json()),
                fetch(`${this.apiBase}/predictions/history/form/${encodeURIComponent(team2Name)}`).then(r => r.json())
            ]);
            
            if (team1Form.success && team2Form.success) {
                this.displayTeamForm(team1Form.form, team2Form.form, team1Name, team2Name);
            }
        } catch (error) {
            console.warn('Failed to load team form data:', error);
        }
    }

    displayHeadToHead(h2h, team1Name, team2Name) {
        const h2hSection = document.getElementById('h2h-section');
        const h2hDiv = document.getElementById('h2h-results');
        
        h2hDiv.innerHTML = `
            <div class="h2h-card fade-in">
                <h3>${team1Name} vs ${team2Name}</h3>
                <div class="h2h-stats">
                    <div class="h2h-stat">
                        <h4>Total Matches</h4>
                        <div class="value">${h2h.total_matches}</div>
                    </div>
                    <div class="h2h-stat">
                        <h4>${team1Name} Wins</h4>
                        <div class="value text-info">${h2h.team1_wins}</div>
                    </div>
                    <div class="h2h-stat">
                        <h4>${team2Name} Wins</h4>
                        <div class="value text-info">${h2h.team2_wins}</div>
                    </div>
                    <div class="h2h-stat">
                        <h4>${team1Name} Win Rate</h4>
                        <div class="value text-success">${(h2h.team1_win_rate * 100).toFixed(1)}%</div>
                    </div>
                </div>
                ${h2h.recent_trend !== 'none' ? `
                    <div style="margin-top: 15px; text-align: center; color: #4a5568;">
                        <strong>Recent Trend:</strong> ${h2h.recent_trend === 'team1' ? team1Name : h2h.recent_trend === 'team2' ? team2Name : 'Mixed'}
                    </div>
                ` : ''}
            </div>
        `;
        
        h2hSection.style.display = 'block';
    }

    displayTeamForm(team1Form, team2Form, team1Name, team2Name) {
        const formSection = document.getElementById('form-section');
        const team1FormDiv = document.getElementById('team1-form');
        const team2FormDiv = document.getElementById('team2-form');
        
        team1FormDiv.innerHTML = this.createFormCard(team1Form, team1Name);
        team2FormDiv.innerHTML = this.createFormCard(team2Form, team2Name);
        
        formSection.style.display = 'block';
    }

    createFormCard(form, teamName) {
        const formMatches = form.form.map(result => 
            `<div class="form-match ${result === 'W' ? 'win' : 'loss'}">${result}</div>`
        ).join('');
        
        return `
            <div class="form-team fade-in">
                <h3>${teamName}</h3>
                <div class="form-stats">
                    <div class="form-stat">
                        <h4>Win Rate</h4>
                        <div class="value text-success">${(form.win_rate * 100).toFixed(1)}%</div>
                    </div>
                    <div class="form-stat">
                        <h4>Streak</h4>
                        <div class="value ${form.streak_type === 'win' ? 'text-success' : form.streak_type === 'loss' ? 'text-danger' : ''}">
                            ${form.streak} ${form.streak_type}
                        </div>
                    </div>
                    <div class="form-stat">
                        <h4>Matches</h4>
                        <div class="value">${form.total_matches}</div>
                    </div>
                </div>
                <div class="form-matches">
                    ${formMatches}
                </div>
            </div>
        `;
    }

    getTeamName(teamId) {
        const team = this.teams.find(t => t.team_id === teamId);
        return team ? team.team : null;
    }

    showLoading(show) {
        const overlay = document.getElementById('loading-overlay');
        const predictBtn = document.getElementById('predict-btn');
        
        if (show) {
            overlay.classList.add('show');
            predictBtn.disabled = true;
        } else {
            overlay.classList.remove('show');
            predictBtn.disabled = false;
        }
    }

    showError(message) {
        // Create a simple error notification
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #f56565;
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            z-index: 1001;
            max-width: 400px;
        `;
        errorDiv.textContent = message;
        
        document.body.appendChild(errorDiv);
        
        // Remove after 5 seconds
        setTimeout(() => {
            errorDiv.remove();
        }, 5000);
    }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new VLRPredictor();
});
