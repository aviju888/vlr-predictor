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
            
            // Load teams from the new advanced prediction system
            const response = await fetch(`${this.apiBase}/advanced/available-teams?_t=${Date.now()}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            this.teams = data.teams || [];
            
            console.log(`Loaded ${this.teams.length} teams from VLR.gg data`);
            console.log('Sample teams:', this.teams.slice(0, 5));
            
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
        
        // Sort teams alphabetically (VLR.gg teams don't have ranks)
        const sortedTeams = [...this.teams].sort((a, b) => a.localeCompare(b));
        
        // Add teams to both dropdowns
        sortedTeams.forEach(team => {
            const option1 = document.createElement('option');
            option1.value = team;
            option1.textContent = team;
            option1.dataset.team = team;
            team1Select.appendChild(option1);
            
            const option2 = document.createElement('option');
            option2.value = team;
            option2.textContent = team;
            option2.dataset.team = team;
            team2Select.appendChild(option2);
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
        
        // Simple local filtering for VLR.gg teams
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
            const team = selectedOption.dataset.team;
            teamInfo.innerHTML = `
                <h3>${team}</h3>
                <p><strong>Source:</strong> VLR.gg Data</p>
                <p><strong>Status:</strong> Active Team</p>
            `;
            teamInfo.classList.add('show');
        } else {
            teamInfo.classList.remove('show');
        }
    }

    async makePrediction() {
        const team1Name = document.getElementById('team1').value;
        const team2Name = document.getElementById('team2').value;
        const mapName = document.getElementById('map-select').value;
        const modelType = document.getElementById('model-select').value;
        
        if (!team1Name || !team2Name) {
            this.showError('Please select both teams before making a prediction.');
            return;
        }
        
        if (team1Name === team2Name) {
            this.showError('Please select different teams.');
            return;
        }
        
        try {
            this.showLoading(true);
            
            // Use the realistic prediction endpoint (zero data leakage)
            const url = new URL(`${this.apiBase}/advanced/realistic/map-predict`);
            url.searchParams.append('teamA', team1Name);
            url.searchParams.append('teamB', team2Name);
            if (mapName) {
                url.searchParams.append('map_name', mapName);
            } else {
                // Default to Ascent if no map selected
                url.searchParams.append('map_name', 'Ascent');
            }
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const prediction = await response.json();
            
            // Check if all features are zero (indicates teams not in dataset)
            const hasRealData = prediction.features && Object.values(prediction.features).some(v => Math.abs(v) > 0.001);
            
            if (!hasRealData) {
                this.displayNoDataWarning(prediction, team1Name, team2Name);
                return;
            }
            
            // Check if user wants series prediction too
            const shouldShowSeries = !mapName; // If no specific map selected, show series
            
            this.displayMapResultCard(prediction);
            
            if (shouldShowSeries) {
                await this.loadSeriesPrediction(team1Name, team2Name);
            }
            
        } catch (error) {
            console.error('Prediction failed:', error);
            this.showError('Failed to make prediction. Please check if the API server is running.');
        } finally {
            this.showLoading(false);
        }
    }

    displayMapResultCard(prediction) {
        const resultsSection = document.getElementById('results-section');
        const resultsDiv = document.getElementById('prediction-results');

        const probA = prediction.prob_teamA;
        const probB = prediction.prob_teamB;
        const teamA = prediction.teamA;
        const teamB = prediction.teamB;
        const mapName = prediction.map_name;
        const confidence = prediction.confidence;
        const uncertainty = prediction.uncertainty || 'Medium';
        const explanation = prediction.explanation;
        const features = prediction.features;
        
        // Get uncertainty chip color
        const getUncertaintyColor = (uncertainty) => {
            switch(uncertainty.toLowerCase()) {
                case 'low': return '#22c55e';
                case 'medium': return '#f59e0b';
                case 'high': return '#ef4444';
                default: return '#6b7280';
            }
        };
        
        // Build key factors (top 3 features)
        const buildKeyFactors = (features) => {
            if (!features) return '<li>Historical performance patterns</li>';
            
            const allFeatures = Object.entries(features)
                .map(([key, value]) => ({ key, value: Number(value) || 0, absValue: Math.abs(Number(value) || 0) }))
                .filter(f => f.absValue > 0.001)
                .sort((a, b) => b.absValue - a.absValue)
                .slice(0, 3);
                
            if (allFeatures.length === 0) {
                return '<li>Limited historical data available</li><li>Prediction based on basic team comparison</li><li>Higher uncertainty due to data constraints</li>';
            }
            
            return allFeatures.map(f => {
                const displayName = f.key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                const direction = f.value > 0 ? 'advantage' : 'disadvantage';
                const impact = f.absValue > 0.2 ? 'Strong' : f.absValue > 0.1 ? 'Moderate' : 'Slight';
                return `<li>${impact} ${displayName.toLowerCase()} ${direction} (${f.value > 0 ? '+' : ''}${f.value.toFixed(3)})</li>`;
            }).join('');
        };
        
        resultsDiv.innerHTML = `
            <div class="map-result-card fade-in">
                <!-- Header with big percentage -->
                <div class="map-result-header">
                    <div class="map-title">
                        <i class="fas fa-map"></i>
                        <span>${mapName} Prediction</span>
                    </div>
                    <div class="confidence-chip" style="background-color: ${getUncertaintyColor(uncertainty)}20; color: ${getUncertaintyColor(uncertainty)};">
                        ${uncertainty} Confidence
                    </div>
                </div>
                
                <!-- Big percentage display -->
                <div class="probability-display">
                    <div class="team-prob ${probA > probB ? 'winner' : ''}">
                        <div class="team-name">${teamA}</div>
                        <div class="big-percentage">${(probA * 100).toFixed(1)}%</div>
                    </div>
                    
                    <div class="vs-separator">vs</div>
                    
                    <div class="team-prob ${probB > probA ? 'winner' : ''}">
                        <div class="team-name">${teamB}</div>
                        <div class="big-percentage">${(probB * 100).toFixed(1)}%</div>
                    </div>
                </div>
                
                <!-- Winner declaration -->
                <div class="winner-declaration">
                    <i class="fas fa-trophy"></i>
                    <span>Predicted Winner: <strong>${probA > probB ? teamA : teamB}</strong></span>
                </div>
                
                <!-- One-line explanation -->
                <div class="explanation-line">
                    ${explanation}
                </div>
                
                <!-- Key factors (3 bullets) -->
                <div class="key-factors">
                    <h4><i class="fas fa-chart-line"></i> Key Factors:</h4>
                    <ul>
                        ${buildKeyFactors(features)}
                    </ul>
                </div>
                
                <!-- Model info -->
                <div class="model-info">
                    <span><strong>Model:</strong> ${prediction.model_version}</span>
                    <span><strong>Data:</strong> VLR.gg Historical</span>
                </div>
            </div>
        `;

        resultsSection.style.display = 'block';
        resultsSection.scrollIntoView({ behavior: 'smooth' });
    }
    
    displayNoDataWarning(prediction, teamA, teamB) {
        const resultsSection = document.getElementById('results-section');
        const resultsDiv = document.getElementById('prediction-results');
        
        resultsDiv.innerHTML = `
            <div class="no-data-warning fade-in">
                <div class="warning-header">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Limited Data Available</h3>
                </div>
                
                <div class="warning-content">
                    <p><strong>${teamA}</strong> vs <strong>${teamB}</strong></p>
                    <p>These teams have limited historical data in our current dataset.</p>
                    
                    <div class="fallback-prediction">
                        <h4>Basic Prediction (Low Confidence):</h4>
                        <div class="basic-result">
                            <span class="team-name">${prediction.winner}</span>
                            <span class="basic-prob">${(prediction.confidence * 100).toFixed(1)}%</span>
                        </div>
                        <p class="uncertainty-note">
                            <i class="fas fa-info-circle"></i>
                            This prediction is based on limited data and should be treated with high uncertainty.
                        </p>
                    </div>
                    
                    <div class="data-suggestion">
                        <h4>Available Teams with Better Data:</h4>
                        <p>Try teams like: <strong>BOARS</strong>, <strong>DNSTY</strong>, <strong>100 Thieves GC</strong>, <strong>EMPIRE :3</strong></p>
                    </div>
                </div>
            </div>
        `;
        
        resultsSection.style.display = 'block';
        resultsSection.scrollIntoView({ behavior: 'smooth' });
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

    getTeamName(teamName) {
        // For VLR.gg teams, we use the team name directly
        return teamName;
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

    async loadSeriesPrediction(teamA, teamB) {
        try {
            const url = new URL(`${this.apiBase}/advanced/series-predict`);
            url.searchParams.append('teamA', teamA);
            url.searchParams.append('teamB', teamB);
            url.searchParams.append('topN', '3');
            
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const seriesData = await response.json();
            this.displaySeriesResultCard(seriesData);
            
        } catch (error) {
            console.warn('Failed to load series prediction:', error);
            // Don't show error for series prediction failure
        }
    }
    
    displaySeriesResultCard(seriesData) {
        const resultsDiv = document.getElementById('prediction-results');
        
        const teamA = seriesData.teamA;
        const teamB = seriesData.teamB;
        const headline = seriesData.headline;
        const alternatives = seriesData.alternatives || [];
        
        // Check if we have realistic probabilities (not 100%)
        const isRealistic = headline.prob_teamA < 0.99 && headline.prob_teamB < 0.99;
        
        if (!isRealistic) {
            // Skip series prediction if it's showing unrealistic 100% probabilities
            return;
        }
        
        const buildMapBreakdown = (perMap) => {
            return perMap.map(m => 
                `<div class="map-breakdown">
                    <span class="map-name">${m.map}</span>
                    <span class="map-probs">${(m.prob_teamA * 100).toFixed(0)}% | ${(m.prob_teamB * 100).toFixed(0)}%</span>
                </div>`
            ).join('');
        };
        
        const buildAlternatives = (alts) => {
            return alts.slice(0, 2).map((alt, index) => 
                `<div class="alternative-combo">
                    <span class="combo-rank">${index === 0 ? '🥈' : '🥉'}</span>
                    <span class="combo-maps">${alt.maps.join(', ')}</span>
                    <span class="combo-prob">(${(alt.prob_teamA * 100).toFixed(1)}%)</span>
                </div>`
            ).join('');
        };
        
        const seriesCard = `
            <div class="series-result-card fade-in">
                <!-- Header -->
                <div class="series-header">
                    <div class="series-title">
                        <i class="fas fa-trophy"></i>
                        <span>BO3 Series Prediction</span>
                    </div>
                </div>
                
                <!-- Best combo headline -->
                <div class="headline-combo">
                    <div class="combo-header">
                        <span class="combo-medal">🥇</span>
                        <span class="combo-label">Best Combo:</span>
                        <span class="combo-maps">${headline.maps.join(', ')}</span>
                    </div>
                    <div class="combo-result">
                        <span class="combo-winner">${headline.prob_teamA > headline.prob_teamB ? teamA : teamB}</span>
                        <span class="combo-percentage">${(Math.max(headline.prob_teamA, headline.prob_teamB) * 100).toFixed(1)}%</span>
                    </div>
                </div>
                
                <!-- Alternative combos -->
                <div class="alternative-combos">
                    <h4><i class="fas fa-list"></i> Alternative Combos:</h4>
                    ${buildAlternatives(alternatives)}
                </div>
                
                <!-- Per-map breakdown -->
                <div class="map-breakdown-section">
                    <h4><i class="fas fa-chart-bar"></i> Per-Map Breakdown:</h4>
                    <div class="map-breakdowns">
                        ${buildMapBreakdown(headline.per_map)}
                    </div>
                </div>
            </div>
        `;
        
        resultsDiv.innerHTML += seriesCard;
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
