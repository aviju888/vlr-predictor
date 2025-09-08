# valorant esports predictor

predict valorant match outcomes, get match summaries.

### what it does

- predict who wins between two teams
- get latest match summary
- uses vlr.gg api data

### features

- team stats from last 30 days
- acs, kd, rating averages
- simple baseline model
- caching for speed
- error handling

# how to run

## setup
```bash
# create virtual environment
python -m venv venv

# activate virtual environment
source venv/bin/activate  # on mac/linux
# or
venv\Scripts\activate     # on windows

# install dependencies
pip install -r requirements.txt
```

## start backend
```bash
# make sure you're in the project directory
cd /path/to/vlr-predictor

# activate virtual environment
source venv/bin/activate

# start the api server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## start frontend
```bash
# open new terminal
cd /path/to/vlr-predictor/frontend

# start frontend server
python -m http.server 8080
```

## access the app
- frontend: http://localhost:8080
- api docs: http://localhost:8000/docs
- health check: http://localhost:8000/health/

## test predictions
- go to http://localhost:8080
- select two teams from dropdowns
- choose prediction model (enhanced recommended)
- click "make prediction"

# how to use


